//! Proof generation for the ZK Timestamp predicate circuit (Phase T.7).
//!
//! Wraps [`zectime_circuit::timestamp_predicate::TimestampPredicateCircuit`] with
//! an ergonomic layer matching [`crate::timestamp::prove_timestamp`] for the
//! open circuit: a JSON-friendly [`PredicateWitness`], a
//! [`TimestampPredicateProvingArtifacts`] bundle, and
//! [`prove_timestamp_predicate`] returning the serialized proof plus public
//! inputs `[commitment, block_height, claim_hash]`.
//!
//! The predicate circuit is heavier than the open circuit (8 Merkle levels +
//! two Poseidon invocations), so it needs `k = 10` and its own SRS.

use std::num::ParseIntError;

use ff::PrimeField;
use halo2_proofs::{
    pasta::{EqAffine, Fp},
    plonk::{create_proof, keygen_pk, keygen_vk, ProvingKey, VerifyingKey},
    poly::commitment::Params,
    transcript::{Blake2bWrite, Challenge255},
};
use rand_core::OsRng;
use serde::{Deserialize, Serialize};
use thiserror::Error;
use zectime_circuit::timestamp_predicate::{
    TimestampPredicateCircuit, INSTANCE_BLOCK_HEIGHT, INSTANCE_CLAIM_HASH, INSTANCE_COMMITMENT,
    TREE_DEPTH,
};

use crate::ProverError;

/// Circuit size parameter `k` for the timestamp-predicate circuit. Distinct
/// from [`crate::timestamp::TIMESTAMP_CIRCUIT_K`] (`9`) because the predicate
/// circuit's 8 Merkle-Poseidon folds don't fit in `2^9` rows.
pub const TIMESTAMP_PREDICATE_CIRCUIT_K: u32 = 10;

/// Number of public inputs exposed by the predicate circuit.
pub const TIMESTAMP_PREDICATE_PUBLIC_INPUTS: usize = 3;

/// Plain witness values for the predicate circuit, serializable so they can
/// flow through the CLI as JSON. Field elements are encoded as
/// `"0x"`-prefixed 32-byte little-endian hex strings.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PredicateWitness {
    /// Merkle-Poseidon root over the document's field leaves (private).
    pub doc_root: String,
    /// Per-commitment random nonce (private, same as open circuit).
    pub nonce: String,
    /// Block height the commitment is anchored at (also public instance[1]).
    pub block_height: u64,
    /// Index of the revealed field within the leaf layer.
    pub field_index: u32,
    /// Value of the revealed field (bound to `claim_hash`).
    pub field_value: String,
    /// Path bits from leaf up to root, bottom-up. Exactly [`TREE_DEPTH`]
    /// entries. `false` = current is left child, `true` = right.
    pub path_bits: Vec<bool>,
    /// Sibling Merkle hashes along the path, bottom-up. Exactly [`TREE_DEPTH`]
    /// entries.
    pub siblings: Vec<String>,
}

/// Errors specific to the predicate wrapper (shape checks + hex decoding).
#[derive(Debug, Error)]
pub enum PredicateWitnessError {
    /// `path_bits` didn't contain exactly [`TREE_DEPTH`] entries.
    #[error("predicate witness path_bits has length {actual}, expected {expected}")]
    PathBitsLength {
        /// Expected entry count ([`TREE_DEPTH`]).
        expected: usize,
        /// Actual entry count supplied.
        actual: usize,
    },
    /// `siblings` didn't contain exactly [`TREE_DEPTH`] entries.
    #[error("predicate witness siblings has length {actual}, expected {expected}")]
    SiblingsLength {
        /// Expected entry count ([`TREE_DEPTH`]).
        expected: usize,
        /// Actual entry count supplied.
        actual: usize,
    },
    /// A hex-encoded field element was malformed or out of range.
    #[error("invalid field element {field}: {source}")]
    InvalidFieldHex {
        /// Human-readable field name (e.g. `"doc_root"`, `"siblings[3]"`).
        field: String,
        /// Underlying decoding error.
        #[source]
        source: FieldHexError,
    },
}

/// Low-level hex decoding failures for predicate witness fields.
#[derive(Debug, Error)]
pub enum FieldHexError {
    /// String didn't start with `"0x"`.
    #[error("expected \"0x\"-prefixed hex")]
    MissingPrefix,
    /// Decoded byte vector had the wrong length (expected 32 bytes).
    #[error("expected 32 bytes, got {0}")]
    WrongByteLength(usize),
    /// Hex payload contained invalid characters.
    #[error("invalid hex digit")]
    InvalidDigit,
    /// Bytes were outside the Pallas scalar field.
    #[error("value is not a valid field element")]
    NotInField,
}

impl From<ParseIntError> for FieldHexError {
    fn from(_: ParseIntError) -> Self {
        FieldHexError::InvalidDigit
    }
}

fn decode_field_hex(s: &str) -> Result<Fp, FieldHexError> {
    let stripped = s.strip_prefix("0x").ok_or(FieldHexError::MissingPrefix)?;
    let mut bytes = Vec::with_capacity(32);
    if stripped.len() % 2 != 0 {
        return Err(FieldHexError::InvalidDigit);
    }
    let mut chars = stripped.chars();
    while let (Some(a), Some(b)) = (chars.next(), chars.next()) {
        let hi = a.to_digit(16).ok_or(FieldHexError::InvalidDigit)? as u8;
        let lo = b.to_digit(16).ok_or(FieldHexError::InvalidDigit)? as u8;
        bytes.push((hi << 4) | lo);
    }
    if bytes.len() != 32 {
        return Err(FieldHexError::WrongByteLength(bytes.len()));
    }
    let mut repr = [0u8; 32];
    repr.copy_from_slice(&bytes);
    Option::<Fp>::from(Fp::from_repr(repr)).ok_or(FieldHexError::NotInField)
}

/// Encode an [`Fp`] as a `"0x"`-prefixed 32-byte little-endian hex string.
pub fn encode_field_hex(value: &Fp) -> String {
    let repr = value.to_repr();
    let mut out = String::with_capacity(2 + 64);
    out.push_str("0x");
    for byte in repr.iter() {
        out.push_str(&format!("{byte:02x}"));
    }
    out
}

impl PredicateWitness {
    /// Decode the witness into field elements, validating shape and encoding.
    fn to_field(&self) -> Result<PredicateWitnessFp, PredicateWitnessError> {
        if self.path_bits.len() != TREE_DEPTH {
            return Err(PredicateWitnessError::PathBitsLength {
                expected: TREE_DEPTH,
                actual: self.path_bits.len(),
            });
        }
        if self.siblings.len() != TREE_DEPTH {
            return Err(PredicateWitnessError::SiblingsLength {
                expected: TREE_DEPTH,
                actual: self.siblings.len(),
            });
        }

        let doc_root = decode_field_hex(&self.doc_root).map_err(|source| {
            PredicateWitnessError::InvalidFieldHex {
                field: "doc_root".into(),
                source,
            }
        })?;
        let nonce = decode_field_hex(&self.nonce).map_err(|source| {
            PredicateWitnessError::InvalidFieldHex {
                field: "nonce".into(),
                source,
            }
        })?;
        let field_value = decode_field_hex(&self.field_value).map_err(|source| {
            PredicateWitnessError::InvalidFieldHex {
                field: "field_value".into(),
                source,
            }
        })?;

        let mut path_bits = [Fp::from(0u64); TREE_DEPTH];
        for (i, bit) in self.path_bits.iter().enumerate() {
            path_bits[i] = if *bit { Fp::from(1u64) } else { Fp::from(0u64) };
        }

        let mut siblings = [Fp::from(0u64); TREE_DEPTH];
        for (i, sib) in self.siblings.iter().enumerate() {
            siblings[i] =
                decode_field_hex(sib).map_err(|source| PredicateWitnessError::InvalidFieldHex {
                    field: format!("siblings[{i}]"),
                    source,
                })?;
        }

        Ok(PredicateWitnessFp {
            doc_root,
            nonce,
            block_height: Fp::from(self.block_height),
            field_index: Fp::from(u64::from(self.field_index)),
            field_value,
            path_bits,
            siblings,
        })
    }
}

#[derive(Debug)]
struct PredicateWitnessFp {
    doc_root: Fp,
    nonce: Fp,
    block_height: Fp,
    field_index: Fp,
    field_value: Fp,
    path_bits: [Fp; TREE_DEPTH],
    siblings: [Fp; TREE_DEPTH],
}

/// Everything needed to create proofs for the timestamp-predicate circuit.
pub struct TimestampPredicateProvingArtifacts {
    /// Structured reference string (IPA parameters).
    pub params: Params<EqAffine>,
    /// Proving key (includes the verifying key).
    pub pk: ProvingKey<EqAffine>,
}

impl TimestampPredicateProvingArtifacts {
    /// Derive everything from a fresh SRS. `k` must be
    /// [`TIMESTAMP_PREDICATE_CIRCUIT_K`] unless the circuit is resized.
    pub fn generate(k: u32) -> Result<Self, ProverError> {
        let params: Params<EqAffine> = Params::new(k);
        Self::from_params(params)
    }

    /// Derive the proving / verifying keys for an already-loaded SRS.
    pub fn from_params(params: Params<EqAffine>) -> Result<Self, ProverError> {
        let empty = TimestampPredicateCircuit::<Fp>::default();
        let vk = keygen_vk(&params, &empty).map_err(ProverError::Keygen)?;
        let pk = keygen_pk(&params, vk, &empty).map_err(ProverError::Keygen)?;
        Ok(Self { params, pk })
    }

    /// Borrow the verifying key for external verification.
    pub fn verifying_key(&self) -> &VerifyingKey<EqAffine> {
        self.pk.get_vk()
    }
}

/// Derive a standalone verifying key for the timestamp-predicate circuit.
/// halo2_proofs 0.3 doesn't expose VK (de)serialization, but `keygen_vk` is
/// deterministic from `(params, circuit)` so the verifier side re-derives it.
pub fn timestamp_predicate_verifying_key_for(
    params: &Params<EqAffine>,
) -> Result<VerifyingKey<EqAffine>, ProverError> {
    let empty = TimestampPredicateCircuit::<Fp>::default();
    keygen_vk(params, &empty).map_err(ProverError::Keygen)
}

/// A complete predicate proof plus its public inputs.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TimestampPredicateProof {
    /// Public inputs for the instance column in circuit order:
    /// `[commitment, block_height, claim_hash]` serialized as little-endian
    /// 32-byte field-element representations.
    pub public_inputs: Vec<[u8; 32]>,
    /// Raw proof bytes (Blake2b-Challenge255 transcript).
    pub proof: Vec<u8>,
}

impl TimestampPredicateProof {
    /// Return the public-input vector as native field elements.
    pub fn public_inputs_fp(&self) -> Result<Vec<Fp>, ProverError> {
        self.public_inputs
            .iter()
            .map(|bytes| {
                Option::<Fp>::from(Fp::from_repr(*bytes))
                    .ok_or(ProverError::InvalidPublicInputEncoding)
            })
            .collect()
    }
}

/// Compute the predicate public inputs out-of-circuit and return their 32-byte
/// little-endian encodings. Useful for callers who want to build a verifier
/// payload without pulling in `halo2_proofs::pasta::Fp` directly.
pub fn compute_predicate_public_inputs_bytes(
    doc_root: &str,
    nonce: &str,
    block_height: u64,
    field_index: u32,
    field_value: &str,
) -> Result<[[u8; 32]; TIMESTAMP_PREDICATE_PUBLIC_INPUTS], PredicateWitnessError> {
    let doc_root_fp =
        decode_field_hex(doc_root).map_err(|source| PredicateWitnessError::InvalidFieldHex {
            field: "doc_root".into(),
            source,
        })?;
    let nonce_fp =
        decode_field_hex(nonce).map_err(|source| PredicateWitnessError::InvalidFieldHex {
            field: "nonce".into(),
            source,
        })?;
    let value_fp =
        decode_field_hex(field_value).map_err(|source| PredicateWitnessError::InvalidFieldHex {
            field: "field_value".into(),
            source,
        })?;
    let block_height_fp = Fp::from(block_height);
    let index_fp = Fp::from(u64::from(field_index));

    let inputs = TimestampPredicateCircuit::<Fp>::public_inputs(
        doc_root_fp,
        nonce_fp,
        block_height_fp,
        index_fp,
        value_fp,
    );
    let mut out = [[0u8; 32]; TIMESTAMP_PREDICATE_PUBLIC_INPUTS];
    for (slot, fp) in out.iter_mut().zip(inputs.iter()) {
        *slot = fp.to_repr();
    }

    let _ = (
        INSTANCE_COMMITMENT,
        INSTANCE_BLOCK_HEIGHT,
        INSTANCE_CLAIM_HASH,
    );
    Ok(out)
}

/// Build a predicate proof for `witness` using `artifacts`.
///
/// Returns the serialized proof plus the matching public-input vector
/// `[commitment, block_height, claim_hash]`.
pub fn prove_timestamp_predicate(
    artifacts: &TimestampPredicateProvingArtifacts,
    witness: &PredicateWitness,
) -> Result<TimestampPredicateProof, ProverError> {
    let w = witness
        .to_field()
        .map_err(|e| ProverError::PredicateWitness(Box::new(e)))?;

    let circuit = TimestampPredicateCircuit::<Fp>::new(
        w.doc_root,
        w.nonce,
        w.block_height,
        w.field_index,
        w.field_value,
        w.path_bits,
        w.siblings,
    );
    let public = TimestampPredicateCircuit::<Fp>::public_inputs(
        w.doc_root,
        w.nonce,
        w.block_height,
        w.field_index,
        w.field_value,
    );

    let mut transcript = Blake2bWrite::<_, EqAffine, Challenge255<_>>::init(Vec::new());
    create_proof(
        &artifacts.params,
        &artifacts.pk,
        &[circuit],
        &[&[&public[..]]],
        OsRng,
        &mut transcript,
    )
    .map_err(ProverError::Proof)?;
    let proof = transcript.finalize();

    let public_bytes = public.iter().map(|fp| fp.to_repr()).collect();
    Ok(TimestampPredicateProof {
        public_inputs: public_bytes,
        proof,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use ff::Field;
    use halo2_gadgets::poseidon::primitives::{ConstantLength, Hash as PoseidonHashFn, P128Pow5T3};

    const DEFAULT_BLOCK_HEIGHT: u64 = 2_750_000;
    const DEFAULT_NONCE: u64 = 0xdead_beef_cafe_f00d;

    fn build_tree(target_index: usize) -> (Fp, [Fp; TREE_DEPTH], Vec<bool>, Fp) {
        let leaf_count = 1usize << TREE_DEPTH;
        let leaves: Vec<Fp> = (0..leaf_count)
            .map(|i| Fp::from(1_000u64 + i as u64))
            .collect();
        let target_leaf = leaves[target_index];

        let mut layer = leaves.clone();
        let mut siblings = [Fp::ZERO; TREE_DEPTH];
        let mut path_bits = Vec::with_capacity(TREE_DEPTH);
        let mut current_index = target_index;
        for sibling_slot in siblings.iter_mut() {
            let is_right = current_index & 1 == 1;
            let sibling_index = if is_right {
                current_index - 1
            } else {
                current_index + 1
            };
            *sibling_slot = layer[sibling_index];
            path_bits.push(is_right);
            let mut next = Vec::with_capacity(layer.len() / 2);
            let mut i = 0;
            while i < layer.len() {
                let h = PoseidonHashFn::<Fp, P128Pow5T3, ConstantLength<2>, 3, 2>::init()
                    .hash([layer[i], layer[i + 1]]);
                next.push(h);
                i += 2;
            }
            layer = next;
            current_index /= 2;
        }

        (layer[0], siblings, path_bits, target_leaf)
    }

    fn sample_witness(target_index: usize) -> (PredicateWitness, Fp, Fp, Fp) {
        let (root, siblings, path_bits, leaf) = build_tree(target_index);
        let nonce = Fp::from(DEFAULT_NONCE);
        let siblings_hex: Vec<String> = siblings.iter().map(encode_field_hex).collect();
        let witness = PredicateWitness {
            doc_root: encode_field_hex(&root),
            nonce: encode_field_hex(&nonce),
            block_height: DEFAULT_BLOCK_HEIGHT,
            field_index: target_index as u32,
            field_value: encode_field_hex(&leaf),
            path_bits,
            siblings: siblings_hex,
        };
        (witness, root, nonce, leaf)
    }

    #[test]
    fn hex_roundtrips_zero_and_one() {
        let zero = encode_field_hex(&Fp::ZERO);
        let one = encode_field_hex(&Fp::ONE);
        assert_eq!(decode_field_hex(&zero).unwrap(), Fp::ZERO);
        assert_eq!(decode_field_hex(&one).unwrap(), Fp::ONE);
    }

    #[test]
    fn hex_roundtrips_random_field_values() {
        for v in [3u64, 42, 999_999, u64::MAX] {
            let fp = Fp::from(v);
            let hex = encode_field_hex(&fp);
            assert_eq!(decode_field_hex(&hex).unwrap(), fp);
        }
    }

    #[test]
    fn rejects_hex_missing_prefix() {
        let err = decode_field_hex("00").unwrap_err();
        matches!(err, FieldHexError::MissingPrefix);
    }

    #[test]
    fn witness_rejects_wrong_path_bits_length() {
        let (mut w, _root, _nonce, _leaf) = sample_witness(42);
        w.path_bits.pop();
        let err = w.to_field().unwrap_err();
        matches!(
            err,
            PredicateWitnessError::PathBitsLength {
                expected: TREE_DEPTH,
                ..
            }
        );
    }

    #[test]
    fn witness_rejects_wrong_siblings_length() {
        let (mut w, _root, _nonce, _leaf) = sample_witness(42);
        w.siblings.pop();
        let err = w.to_field().unwrap_err();
        matches!(
            err,
            PredicateWitnessError::SiblingsLength {
                expected: TREE_DEPTH,
                ..
            }
        );
    }

    #[test]
    fn public_inputs_bytes_match_native() {
        let (w, root, nonce, leaf) = sample_witness(42);
        let native = TimestampPredicateCircuit::<Fp>::public_inputs(
            root,
            nonce,
            Fp::from(DEFAULT_BLOCK_HEIGHT),
            Fp::from(42u64),
            leaf,
        );
        let bytes = compute_predicate_public_inputs_bytes(
            &w.doc_root,
            &w.nonce,
            w.block_height,
            w.field_index,
            &w.field_value,
        )
        .expect("native inputs");
        for (slot, fp) in bytes.iter().zip(native.iter()) {
            assert_eq!(slot, &fp.to_repr());
        }
    }

    // Keygen at K=10 on pasta can be slow; gate the full proof smoke test
    // behind a cheap sanity check rather than generating fresh artifacts on
    // every `cargo test`. The prover/verifier roundtrip is covered in
    // crates/prover/tests/timestamp_predicate_roundtrip.rs.
    #[test]
    fn circuit_constants_match() {
        assert_eq!(TIMESTAMP_PREDICATE_CIRCUIT_K, 10);
        assert_eq!(TIMESTAMP_PREDICATE_PUBLIC_INPUTS, 3);
    }
}

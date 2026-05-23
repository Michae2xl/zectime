//! Proof generation for the ZK Timestamp open circuit (Phase T.3).
//!
//! Wraps [`zectime_circuit::timestamp::TimestampOpenCircuit`] with a
//! JSON-friendly [`TimestampWitness`], a [`TimestampProvingArtifacts`] bundle,
//! and a [`prove_timestamp`] entry point that returns a serialized proof
//! together with its public inputs `[commitment, block_height]`.
//!
//! The commitment itself is
//! `Poseidon(domain_tag, doc_hash_lo_128, doc_hash_hi_128, nonce_128)`.
//! `block_height` remains public receipt evidence and must be checked against
//! the confirmed Zcash transaction that carries `commitment`.
//!
//! The circuit has no range / set-membership gates, so `k = 9` fits
//! comfortably.

use halo2_proofs::{
    pasta::{EqAffine, Fp},
    plonk::{create_proof, keygen_pk, keygen_vk, ProvingKey, VerifyingKey},
    poly::commitment::Params,
    transcript::{Blake2bWrite, Challenge255},
};
use rand_core::OsRng;
use serde::{Deserialize, Serialize};
use zectime_circuit::timestamp::TimestampOpenCircuit;

use crate::ProverError;

/// Circuit size parameter `k` for the timestamp-open circuit.
pub const TIMESTAMP_CIRCUIT_K: u32 = 9;

/// Plain witness values for the timestamp-open circuit, serializable so they
/// flow through the CLI as JSON.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TimestampWitness {
    /// Low 128 bits of the document hash (private witness).
    pub doc_hash_lo: u128,
    /// High 128 bits of the document hash (private witness).
    pub doc_hash_hi: u128,
    /// Per-commitment 128-bit random nonce (private witness).
    pub nonce: u128,
    /// Zcash block height the commitment is anchored at (also a public input).
    pub block_height: u64,
}

impl TimestampWitness {
    fn to_field(&self) -> TimestampWitnessFp {
        TimestampWitnessFp {
            doc_hash_lo: fp_from_u128(self.doc_hash_lo),
            doc_hash_hi: fp_from_u128(self.doc_hash_hi),
            nonce: fp_from_u128(self.nonce),
            block_height: Fp::from(self.block_height),
        }
    }
}

struct TimestampWitnessFp {
    doc_hash_lo: Fp,
    doc_hash_hi: Fp,
    nonce: Fp,
    block_height: Fp,
}

/// Everything needed to create proofs for the timestamp-open circuit.
pub struct TimestampProvingArtifacts {
    /// Structured reference string (IPA parameters).
    pub params: Params<EqAffine>,
    /// Proving key (includes the verifying key).
    pub pk: ProvingKey<EqAffine>,
}

impl TimestampProvingArtifacts {
    /// Derive everything from a fresh SRS. `k` must be
    /// [`TIMESTAMP_CIRCUIT_K`] unless the circuit is resized.
    pub fn generate(k: u32) -> Result<Self, ProverError> {
        let params: Params<EqAffine> = Params::new(k);
        Self::from_params(params)
    }

    /// Derive the proving / verifying keys for an already-loaded SRS.
    pub fn from_params(params: Params<EqAffine>) -> Result<Self, ProverError> {
        let empty = TimestampOpenCircuit::<Fp>::default();
        let vk = keygen_vk(&params, &empty).map_err(ProverError::Keygen)?;
        let pk = keygen_pk(&params, vk, &empty).map_err(ProverError::Keygen)?;
        Ok(Self { params, pk })
    }

    /// Borrow the verifying key for external verification.
    pub fn verifying_key(&self) -> &VerifyingKey<EqAffine> {
        self.pk.get_vk()
    }
}

/// Derive a standalone verifying key for the timestamp-open circuit. The
/// verifier side uses this instead of carrying a serialized key around:
/// halo2_proofs 0.3 doesn't expose VK (de)serialization, but `keygen_vk` is
/// deterministic from `(params, circuit)`.
pub fn timestamp_verifying_key_for(
    params: &Params<EqAffine>,
) -> Result<VerifyingKey<EqAffine>, ProverError> {
    let empty = TimestampOpenCircuit::<Fp>::default();
    keygen_vk(params, &empty).map_err(ProverError::Keygen)
}

/// A complete timestamp proof plus its public inputs.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TimestampProof {
    /// Public inputs for the instance column in circuit order:
    /// `[commitment, block_height]` serialized as little-endian 32-byte
    /// field-element representations.
    pub public_inputs: Vec<[u8; 32]>,
    /// Raw proof bytes (Blake2b-Challenge255 transcript).
    pub proof: Vec<u8>,
}

impl TimestampProof {
    /// Return the public-input vector as native field elements.
    pub fn public_inputs_fp(&self) -> Result<Vec<Fp>, ProverError> {
        use ff::PrimeField;
        self.public_inputs
            .iter()
            .map(|bytes| {
                Option::<Fp>::from(Fp::from_repr(*bytes))
                    .ok_or(ProverError::InvalidPublicInputEncoding)
            })
            .collect()
    }
}

/// Compute the Poseidon commitment for a witness out-of-circuit, returning its
/// 32-byte little-endian field repr. Convenient for callers (e.g. the CLI)
/// that want to build a receipt from the same u64 tuple without depending on
/// `halo2_proofs::pasta::Fp` or `ff::PrimeField` directly.
pub fn compute_commitment_bytes(doc_hash_lo: u128, doc_hash_hi: u128, nonce: u128) -> [u8; 32] {
    use ff::PrimeField;
    let commitment = TimestampOpenCircuit::<Fp>::compute_commitment(
        fp_from_u128(doc_hash_lo),
        fp_from_u128(doc_hash_hi),
        fp_from_u128(nonce),
    );
    commitment.to_repr()
}

/// Build a proof for `witness` using `artifacts`.
///
/// Returns the serialized proof plus the matching public-input vector
/// `[commitment, block_height]`.
pub fn prove_timestamp(
    artifacts: &TimestampProvingArtifacts,
    witness: &TimestampWitness,
) -> Result<TimestampProof, ProverError> {
    use ff::PrimeField;

    let w = witness.to_field();
    let circuit =
        TimestampOpenCircuit::<Fp>::new(w.doc_hash_lo, w.doc_hash_hi, w.nonce, w.block_height);
    let public = TimestampOpenCircuit::<Fp>::public_inputs(
        w.doc_hash_lo,
        w.doc_hash_hi,
        w.nonce,
        w.block_height,
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
    Ok(TimestampProof {
        public_inputs: public_bytes,
        proof,
    })
}

fn fp_from_u128(value: u128) -> Fp {
    let lo = value as u64;
    let hi = (value >> 64) as u64;
    let two_pow_64 = Fp::from(u64::MAX) + Fp::from(1);
    Fp::from(lo) + (Fp::from(hi) * two_pow_64)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_witness() -> TimestampWitness {
        TimestampWitness {
            doc_hash_lo: 0x0123_4567_89ab_cdef_0011_2233_4455_6677,
            doc_hash_hi: 0xfedc_ba98_7654_3210_7766_5544_3322_1100,
            nonce: 0xdead_beef_cafe_f00d_0102_0304_0506_0708,
            block_height: 2_750_000,
        }
    }

    #[test]
    fn proves_valid_witness() {
        let artifacts =
            TimestampProvingArtifacts::generate(TIMESTAMP_CIRCUIT_K).expect("artifacts");
        let proof = prove_timestamp(&artifacts, &sample_witness()).expect("prove");
        assert_eq!(proof.public_inputs.len(), 2);
        assert!(!proof.proof.is_empty());
    }

    #[test]
    fn public_inputs_roundtrip_through_bytes() {
        let artifacts =
            TimestampProvingArtifacts::generate(TIMESTAMP_CIRCUIT_K).expect("artifacts");
        let witness = sample_witness();
        let proof = prove_timestamp(&artifacts, &witness).expect("prove");
        let fps = proof.public_inputs_fp().expect("decode");
        let expected = TimestampOpenCircuit::<Fp>::public_inputs(
            fp_from_u128(witness.doc_hash_lo),
            fp_from_u128(witness.doc_hash_hi),
            fp_from_u128(witness.nonce),
            Fp::from(witness.block_height),
        );
        assert_eq!(fps, expected);
    }
}

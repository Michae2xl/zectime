//! End-to-end predicate prove -> verify round-trip integration test.
//!
//! Builds a real 2^8-leaf Merkle-Poseidon tree, proves knowledge of a specific
//! field at a specific index, then verifies the resulting Halo2 IPA proof.
//! Also exercises the negative paths: tampered commitment, claim hash, block
//! height, and wrong public-input arity.

use ff::Field;
use halo2_proofs::pasta::Fp;
use zectime_circuit::timestamp_predicate::{TimestampPredicateCircuit, TREE_DEPTH};
use zectime_prover::timestamp_predicate::{
    encode_field_hex, prove_timestamp_predicate, timestamp_predicate_verifying_key_for,
    PredicateWitness, TimestampPredicateProvingArtifacts, TIMESTAMP_PREDICATE_CIRCUIT_K,
};
use zectime_verifier::verify_timestamp_predicate;

const DEFAULT_BLOCK_HEIGHT: u64 = 2_750_000;
const DEFAULT_NONCE: u64 = 0xdead_beef_cafe_f00d;
const TARGET_INDEX: usize = 42;

fn build_tree() -> (Fp, [Fp; TREE_DEPTH], Vec<bool>, Fp) {
    let leaf_count = 1usize << TREE_DEPTH;
    let values: Vec<Fp> = (0..leaf_count)
        .map(|i| Fp::from(1_000u64 + i as u64))
        .collect();
    let leaves: Vec<Fp> = values
        .iter()
        .enumerate()
        .map(|(i, value)| {
            TimestampPredicateCircuit::<Fp>::compute_leaf_hash(Fp::from(i as u64), *value)
        })
        .collect();
    let target_leaf = values[TARGET_INDEX];

    let mut layer = leaves.clone();
    let mut siblings = [Fp::ZERO; TREE_DEPTH];
    let mut path_bits = Vec::with_capacity(TREE_DEPTH);
    let mut current_index = TARGET_INDEX;

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
            let h = TimestampPredicateCircuit::<Fp>::compute_node_hash(layer[i], layer[i + 1]);
            next.push(h);
            i += 2;
        }
        layer = next;
        current_index /= 2;
    }

    (layer[0], siblings, path_bits, target_leaf)
}

fn sample_witness() -> PredicateWitness {
    let (root, siblings, path_bits, leaf) = build_tree();
    let nonce = Fp::from(DEFAULT_NONCE);
    let siblings_hex: Vec<String> = siblings.iter().map(encode_field_hex).collect();
    PredicateWitness {
        doc_root: encode_field_hex(&root),
        nonce: encode_field_hex(&nonce),
        block_height: DEFAULT_BLOCK_HEIGHT,
        field_index: TARGET_INDEX as u32,
        field_value: encode_field_hex(&leaf),
        path_bits,
        siblings: siblings_hex,
    }
}

#[test]
fn prove_then_verify_accepts_valid_proof() {
    let artifacts = TimestampPredicateProvingArtifacts::generate(TIMESTAMP_PREDICATE_CIRCUIT_K)
        .expect("artifacts");
    let proof = prove_timestamp_predicate(&artifacts, &sample_witness()).expect("prove");
    assert_eq!(proof.public_inputs.len(), 3);

    let vk = timestamp_predicate_verifying_key_for(&artifacts.params).expect("vk");
    verify_timestamp_predicate(&artifacts.params, &vk, &proof.public_inputs, &proof.proof)
        .expect("valid proof should verify");
}

#[test]
fn verify_rejects_tampered_commitment() {
    let artifacts = TimestampPredicateProvingArtifacts::generate(TIMESTAMP_PREDICATE_CIRCUIT_K)
        .expect("artifacts");
    let proof = prove_timestamp_predicate(&artifacts, &sample_witness()).expect("prove");

    let mut tampered = proof.public_inputs.clone();
    tampered[0][0] ^= 1;

    let vk = timestamp_predicate_verifying_key_for(&artifacts.params).expect("vk");
    assert!(
        verify_timestamp_predicate(&artifacts.params, &vk, &tampered, &proof.proof).is_err(),
        "tampered commitment must be rejected"
    );
}

#[test]
fn verify_rejects_tampered_block_height() {
    let artifacts = TimestampPredicateProvingArtifacts::generate(TIMESTAMP_PREDICATE_CIRCUIT_K)
        .expect("artifacts");
    let proof = prove_timestamp_predicate(&artifacts, &sample_witness()).expect("prove");

    let mut tampered = proof.public_inputs.clone();
    tampered[1][0] ^= 1;

    let vk = timestamp_predicate_verifying_key_for(&artifacts.params).expect("vk");
    assert!(
        verify_timestamp_predicate(&artifacts.params, &vk, &tampered, &proof.proof).is_err(),
        "tampered block_height must be rejected"
    );
}

#[test]
fn verify_rejects_tampered_claim_hash() {
    let artifacts = TimestampPredicateProvingArtifacts::generate(TIMESTAMP_PREDICATE_CIRCUIT_K)
        .expect("artifacts");
    let proof = prove_timestamp_predicate(&artifacts, &sample_witness()).expect("prove");

    let mut tampered = proof.public_inputs.clone();
    tampered[2][0] ^= 1;

    let vk = timestamp_predicate_verifying_key_for(&artifacts.params).expect("vk");
    assert!(
        verify_timestamp_predicate(&artifacts.params, &vk, &tampered, &proof.proof).is_err(),
        "tampered claim_hash must be rejected"
    );
}

#[test]
fn verify_rejects_tampered_proof_bytes() {
    let artifacts = TimestampPredicateProvingArtifacts::generate(TIMESTAMP_PREDICATE_CIRCUIT_K)
        .expect("artifacts");
    let proof = prove_timestamp_predicate(&artifacts, &sample_witness()).expect("prove");

    let mut bad = proof.proof.clone();
    let i = bad.len() / 2;
    bad[i] ^= 0xff;

    let vk = timestamp_predicate_verifying_key_for(&artifacts.params).expect("vk");
    assert!(
        verify_timestamp_predicate(&artifacts.params, &vk, &proof.public_inputs, &bad).is_err(),
        "tampered proof bytes must be rejected"
    );
}

#[test]
fn verify_rejects_wrong_arity() {
    let artifacts = TimestampPredicateProvingArtifacts::generate(TIMESTAMP_PREDICATE_CIRCUIT_K)
        .expect("artifacts");
    let proof = prove_timestamp_predicate(&artifacts, &sample_witness()).expect("prove");

    let too_few: Vec<[u8; 32]> = proof.public_inputs[..2].to_vec();

    let vk = timestamp_predicate_verifying_key_for(&artifacts.params).expect("vk");
    assert!(
        verify_timestamp_predicate(&artifacts.params, &vk, &too_few, &proof.proof).is_err(),
        "arity mismatch must be rejected"
    );
}

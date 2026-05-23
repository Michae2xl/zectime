//! End-to-end timestamp prove -> verify round-trip integration test.

use zectime_prover::timestamp::{
    prove_timestamp, timestamp_verifying_key_for, TimestampProvingArtifacts, TimestampWitness,
    TIMESTAMP_CIRCUIT_K,
};
use zectime_verifier::verify_timestamp;

fn sample_witness() -> TimestampWitness {
    TimestampWitness {
        doc_hash_lo: 0x0123_4567_89ab_cdef_0011_2233_4455_6677,
        doc_hash_hi: 0xfedc_ba98_7654_3210_7766_5544_3322_1100,
        nonce: 0xdead_beef_cafe_f00d_0102_0304_0506_0708,
        block_height: 2_750_000,
    }
}

#[test]
fn prove_then_verify_accepts_valid_proof() {
    let artifacts = TimestampProvingArtifacts::generate(TIMESTAMP_CIRCUIT_K).expect("artifacts");
    let proof = prove_timestamp(&artifacts, &sample_witness()).expect("prove");

    let vk = timestamp_verifying_key_for(&artifacts.params).expect("vk");
    verify_timestamp(&artifacts.params, &vk, &proof.public_inputs, &proof.proof)
        .expect("valid proof should verify");
}

#[test]
fn verify_rejects_tampered_commitment() {
    let artifacts = TimestampProvingArtifacts::generate(TIMESTAMP_CIRCUIT_K).expect("artifacts");
    let proof = prove_timestamp(&artifacts, &sample_witness()).expect("prove");

    let mut tampered = proof.public_inputs.clone();
    // Flip a bit in the commitment so the first public input no longer matches
    // the Poseidon output committed inside the proof.
    tampered[0][0] ^= 1;

    let vk = timestamp_verifying_key_for(&artifacts.params).expect("vk");
    assert!(
        verify_timestamp(&artifacts.params, &vk, &tampered, &proof.proof).is_err(),
        "tampered commitment must be rejected"
    );
}

#[test]
fn verify_rejects_tampered_block_height() {
    let artifacts = TimestampProvingArtifacts::generate(TIMESTAMP_CIRCUIT_K).expect("artifacts");
    let proof = prove_timestamp(&artifacts, &sample_witness()).expect("prove");

    let mut tampered = proof.public_inputs.clone();
    // Flip a bit in the block_height public input so it no longer matches the
    // receipt-height advice cell copied into the circuit.
    tampered[1][0] ^= 1;

    let vk = timestamp_verifying_key_for(&artifacts.params).expect("vk");
    assert!(
        verify_timestamp(&artifacts.params, &vk, &tampered, &proof.proof).is_err(),
        "tampered block_height must be rejected"
    );
}

#[test]
fn verify_rejects_tampered_proof_bytes() {
    let artifacts = TimestampProvingArtifacts::generate(TIMESTAMP_CIRCUIT_K).expect("artifacts");
    let proof = prove_timestamp(&artifacts, &sample_witness()).expect("prove");

    let mut bad = proof.proof.clone();
    let i = bad.len() / 2;
    bad[i] ^= 0xff;

    let vk = timestamp_verifying_key_for(&artifacts.params).expect("vk");
    assert!(
        verify_timestamp(&artifacts.params, &vk, &proof.public_inputs, &bad).is_err(),
        "tampered proof bytes must be rejected"
    );
}

#[test]
fn verify_rejects_wrong_arity() {
    let artifacts = TimestampProvingArtifacts::generate(TIMESTAMP_CIRCUIT_K).expect("artifacts");
    let proof = prove_timestamp(&artifacts, &sample_witness()).expect("prove");

    // Drop the block_height input.
    let too_few: Vec<[u8; 32]> = proof.public_inputs[..1].to_vec();

    let vk = timestamp_verifying_key_for(&artifacts.params).expect("vk");
    assert!(
        verify_timestamp(&artifacts.params, &vk, &too_few, &proof.proof).is_err(),
        "arity mismatch must be rejected"
    );
}

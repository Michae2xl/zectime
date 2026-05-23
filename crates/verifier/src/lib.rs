//! Proof verification for ZecTime timestamp receipts.

#![forbid(unsafe_code)]
#![warn(missing_docs)]

use ff::PrimeField;
use halo2_proofs::{
    pasta::{EqAffine, Fp},
    plonk::{verify_proof, SingleVerifier, VerifyingKey},
    poly::commitment::Params,
    transcript::{Blake2bRead, Challenge255},
};
use thiserror::Error;

/// Errors raised by the verifier.
#[derive(Debug, Error)]
pub enum VerifierError {
    /// Halo2 rejected the proof.
    #[error("halo2 verification failed: {0}")]
    Halo2(halo2_proofs::plonk::Error),
    /// One serialized public input could not be decoded.
    #[error("invalid public input encoding at index {0}")]
    InvalidPublicInputEncoding(usize),
    /// Public input vector size does not match the circuit.
    #[error("expected {expected} public inputs, got {actual}")]
    PublicInputArity {
        /// Number of public inputs expected by the circuit.
        expected: usize,
        /// Number supplied by the caller.
        actual: usize,
    },
}

/// Public inputs for timestamp-open proofs: `[commitment, block_height]`.
pub const EXPECTED_TIMESTAMP_PUBLIC_INPUTS: usize = 2;

/// Public inputs for timestamp-predicate proofs:
/// `[commitment, block_height, claim_hash]`.
pub const EXPECTED_TIMESTAMP_PREDICATE_PUBLIC_INPUTS: usize = 3;

/// Verify a timestamp-open proof.
pub fn verify_timestamp(
    params: &Params<EqAffine>,
    vk: &VerifyingKey<EqAffine>,
    public_inputs: &[[u8; 32]],
    proof: &[u8],
) -> Result<(), VerifierError> {
    verify_with_arity(
        params,
        vk,
        public_inputs,
        proof,
        EXPECTED_TIMESTAMP_PUBLIC_INPUTS,
    )
}

/// Verify a timestamp-predicate proof.
pub fn verify_timestamp_predicate(
    params: &Params<EqAffine>,
    vk: &VerifyingKey<EqAffine>,
    public_inputs: &[[u8; 32]],
    proof: &[u8],
) -> Result<(), VerifierError> {
    verify_with_arity(
        params,
        vk,
        public_inputs,
        proof,
        EXPECTED_TIMESTAMP_PREDICATE_PUBLIC_INPUTS,
    )
}

fn verify_with_arity(
    params: &Params<EqAffine>,
    vk: &VerifyingKey<EqAffine>,
    public_inputs: &[[u8; 32]],
    proof: &[u8],
    expected: usize,
) -> Result<(), VerifierError> {
    if public_inputs.len() != expected {
        return Err(VerifierError::PublicInputArity {
            expected,
            actual: public_inputs.len(),
        });
    }

    let public: Vec<Fp> = public_inputs
        .iter()
        .enumerate()
        .map(|(i, bytes)| {
            Option::<Fp>::from(Fp::from_repr(*bytes))
                .ok_or(VerifierError::InvalidPublicInputEncoding(i))
        })
        .collect::<Result<_, _>>()?;

    let strategy = SingleVerifier::new(params);
    let mut transcript = Blake2bRead::<_, EqAffine, Challenge255<_>>::init(proof);

    verify_proof(params, vk, strategy, &[&[&public[..]]], &mut transcript)
        .map_err(VerifierError::Halo2)
}

//! Proof generation for ZecTime timestamp receipts.

#![forbid(unsafe_code)]
#![warn(missing_docs)]

pub mod timestamp;
pub mod timestamp_predicate;

use std::io::{self, Read, Write};

use halo2_proofs::{pasta::EqAffine, poly::commitment::Params};
use thiserror::Error;

/// Errors raised by the prover.
#[derive(Debug, Error)]
pub enum ProverError {
    /// Halo2 key generation failed.
    #[error("halo2 keygen failure: {0}")]
    Keygen(halo2_proofs::plonk::Error),
    /// Halo2 proof creation failed.
    #[error("halo2 proof creation failure: {0}")]
    Proof(halo2_proofs::plonk::Error),
    /// A serialized public input could not be decoded as a field element.
    #[error("invalid public input encoding")]
    InvalidPublicInputEncoding,
    /// I/O error while reading or writing params/proofs.
    #[error("io error: {0}")]
    Io(#[from] io::Error),
    /// Predicate witness failed shape or encoding checks.
    #[error("predicate witness: {0}")]
    PredicateWitness(#[source] Box<timestamp_predicate::PredicateWitnessError>),
}

/// Serialize SRS parameters.
pub fn write_params<W: Write>(params: &Params<EqAffine>, mut writer: W) -> Result<(), ProverError> {
    params.write(&mut writer)?;
    Ok(())
}

/// Read SRS parameters.
pub fn read_params<R: Read>(mut reader: R) -> Result<Params<EqAffine>, ProverError> {
    Ok(Params::<EqAffine>::read(&mut reader)?)
}

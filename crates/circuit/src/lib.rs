//! Halo2 circuits for ZecTime.

#![forbid(unsafe_code)]
#![warn(missing_docs)]

/// Full-reveal timestamp opening circuit.
pub mod timestamp;
/// Selective-disclosure timestamp predicate circuit.
pub mod timestamp_predicate;

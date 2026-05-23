//! Shared Orchard memo constants and decode errors.

use thiserror::Error;

/// Magic bytes identifying a ZecTime memo (`"ZC"`).
pub const MAGIC: [u8; 2] = [0x5A, 0x43];

/// Total Orchard memo length in bytes.
pub const MEMO_LEN: usize = 512;

/// Errors produced when decoding a memo blob.
#[derive(Debug, Error, PartialEq, Eq)]
pub enum MemoError {
    /// Input was not exactly [`MEMO_LEN`] bytes.
    #[error("invalid memo length: expected {MEMO_LEN}, got {0}")]
    InvalidLength(usize),
    /// Magic prefix did not match [`MAGIC`].
    #[error("invalid magic bytes: expected {expected:02x?}, got {got:02x?}")]
    InvalidMagic {
        /// Expected magic bytes.
        expected: [u8; 2],
        /// Magic bytes seen in the blob.
        got: [u8; 2],
    },
    /// Version byte was unsupported.
    #[error("unsupported memo version: {0:#04x}")]
    UnsupportedVersion(u8),
    /// Bytes past the documented fields were non-zero.
    #[error("non-zero padding detected at offset {0}")]
    NonZeroPadding(usize),
}

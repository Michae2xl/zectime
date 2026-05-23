//! Orchard memo encoder/decoder for ZK Timestamp anchors (Phase T.4).
//!
//! Layout (version `0x02`, 512 bytes total):
//!
//! ```text
//! [0..2]    magic       (0x5A, 0x43 : "ZC")
//! [2..3]    version     (0x02)
//! [3..35]   commitment  (Poseidon P128Pow5T3 output, 32-byte little-endian
//!                        field repr, matches `TimestampProof.public_inputs[0]`)
//! [35..512] padding     (zero)
//! ```
//!
//! Only the Poseidon `commitment` is pinned on-chain: the block height is the
//! tx's own block height (read back via RPC), and the document hash / nonce
//! stay off-chain in the receipt emitted by `zectime timestamp stamp`. This keeps
//! the on-chain footprint to exactly one 32-byte field and preserves the same
//! zero-knowledge properties as the circuit itself.

use serde::{Deserialize, Serialize};

use crate::memo::{MemoError, MAGIC, MEMO_LEN};

/// Memo layout version reserved for timestamp anchors.
pub const TIMESTAMP_VERSION: u8 = 0x02;

const MAGIC_RANGE: std::ops::Range<usize> = 0..2;
const VERSION_OFFSET: usize = 2;
const COMMITMENT_RANGE: std::ops::Range<usize> = 3..35;

/// Decoded timestamp-memo payload.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct TimestampMemo {
    /// Poseidon commitment `Poseidon(domain_tag, doc_hash_lo, doc_hash_hi, nonce)`
    /// serialized as a 32-byte little-endian field repr. Identical to the first
    /// public input of [`zectime_prover::timestamp::TimestampProof`].
    pub commitment: [u8; 32],
}

impl TimestampMemo {
    /// Build a new timestamp memo from a raw commitment blob.
    pub fn new(commitment: [u8; 32]) -> Self {
        Self { commitment }
    }
}

/// Encode a [`TimestampMemo`] into the 512-byte Orchard memo field.
pub fn encode_timestamp(memo: &TimestampMemo) -> [u8; MEMO_LEN] {
    let mut out = [0u8; MEMO_LEN];
    out[MAGIC_RANGE].copy_from_slice(&MAGIC);
    out[VERSION_OFFSET] = TIMESTAMP_VERSION;
    out[COMMITMENT_RANGE].copy_from_slice(&memo.commitment);
    out
}

/// Decode a 512-byte memo blob into a [`TimestampMemo`].
///
/// Returns [`MemoError::UnsupportedVersion`] if the version byte is not
/// [`TIMESTAMP_VERSION`].
pub fn decode_timestamp(bytes: &[u8]) -> Result<TimestampMemo, MemoError> {
    if bytes.len() != MEMO_LEN {
        return Err(MemoError::InvalidLength(bytes.len()));
    }

    let magic: [u8; 2] = bytes[MAGIC_RANGE].try_into().expect("slice is 2 bytes");
    if magic != MAGIC {
        return Err(MemoError::InvalidMagic {
            expected: MAGIC,
            got: magic,
        });
    }

    let version = bytes[VERSION_OFFSET];
    if version != TIMESTAMP_VERSION {
        return Err(MemoError::UnsupportedVersion(version));
    }

    let commitment: [u8; 32] = bytes[COMMITMENT_RANGE]
        .try_into()
        .expect("slice is 32 bytes");

    if let Some(pos) = bytes[COMMITMENT_RANGE.end..].iter().position(|&b| b != 0) {
        return Err(MemoError::NonZeroPadding(COMMITMENT_RANGE.end + pos));
    }

    Ok(TimestampMemo { commitment })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_commitment() -> [u8; 32] {
        let mut c = [0u8; 32];
        for (i, b) in c.iter_mut().enumerate() {
            *b = (i as u8).wrapping_mul(13).wrapping_add(5);
        }
        c
    }

    fn sample_memo() -> TimestampMemo {
        TimestampMemo::new(sample_commitment())
    }

    #[test]
    fn roundtrip_preserves_commitment() {
        let memo = sample_memo();
        let blob = encode_timestamp(&memo);
        assert_eq!(blob.len(), MEMO_LEN);
        let decoded = decode_timestamp(&blob).expect("decode roundtrip");
        assert_eq!(decoded, memo);
    }

    #[test]
    fn encode_writes_expected_header() {
        let memo = sample_memo();
        let blob = encode_timestamp(&memo);
        assert_eq!(&blob[MAGIC_RANGE], &MAGIC);
        assert_eq!(blob[VERSION_OFFSET], TIMESTAMP_VERSION);
        assert_eq!(&blob[COMMITMENT_RANGE], &memo.commitment);
        for (i, &b) in blob[COMMITMENT_RANGE.end..].iter().enumerate() {
            assert_eq!(b, 0, "padding non-zero at offset {i}");
        }
    }

    #[test]
    fn decode_rejects_wrong_length() {
        let err = decode_timestamp(&[0u8; MEMO_LEN - 1]).unwrap_err();
        assert_eq!(err, MemoError::InvalidLength(MEMO_LEN - 1));

        let err = decode_timestamp(&[0u8; MEMO_LEN + 1]).unwrap_err();
        assert_eq!(err, MemoError::InvalidLength(MEMO_LEN + 1));
    }

    #[test]
    fn decode_rejects_invalid_magic() {
        let mut blob = encode_timestamp(&sample_memo());
        blob[0] = 0x00;
        let err = decode_timestamp(&blob).unwrap_err();
        assert!(matches!(err, MemoError::InvalidMagic { .. }));
    }

    #[test]
    fn decode_rejects_non_timestamp_version() {
        let mut blob = encode_timestamp(&sample_memo());
        blob[VERSION_OFFSET] = 0x01;
        let err = decode_timestamp(&blob).unwrap_err();
        assert_eq!(err, MemoError::UnsupportedVersion(0x01));
    }

    #[test]
    fn decode_rejects_unknown_version() {
        let mut blob = encode_timestamp(&sample_memo());
        blob[VERSION_OFFSET] = 0xFF;
        let err = decode_timestamp(&blob).unwrap_err();
        assert_eq!(err, MemoError::UnsupportedVersion(0xFF));
    }

    #[test]
    fn decode_rejects_nonzero_padding() {
        let mut blob = encode_timestamp(&sample_memo());
        blob[MEMO_LEN - 1] = 0xFF;
        let err = decode_timestamp(&blob).unwrap_err();
        assert_eq!(err, MemoError::NonZeroPadding(MEMO_LEN - 1));
    }

    #[test]
    fn decode_rejects_nonzero_padding_just_after_commitment() {
        let mut blob = encode_timestamp(&sample_memo());
        blob[COMMITMENT_RANGE.end] = 0x01;
        let err = decode_timestamp(&blob).unwrap_err();
        assert_eq!(err, MemoError::NonZeroPadding(COMMITMENT_RANGE.end));
    }

    #[test]
    fn tampered_commitment_byte_changes_decoded_value() {
        let memo = sample_memo();
        let mut blob = encode_timestamp(&memo);
        blob[COMMITMENT_RANGE.start] ^= 0x01;
        let decoded = decode_timestamp(&blob).expect("still decodes");
        assert_ne!(decoded.commitment, memo.commitment);
    }

    /// A non-timestamp ZecTime memo version must not accidentally decode as a
    /// timestamp memo. Guards against layout confusion.
    #[test]
    fn wrong_version_blob_fails_timestamp_decode() {
        let mut blob = encode_timestamp(&sample_memo());
        blob[VERSION_OFFSET] = 0x01;
        let err = decode_timestamp(&blob).unwrap_err();
        assert_eq!(err, MemoError::UnsupportedVersion(0x01));
    }
}

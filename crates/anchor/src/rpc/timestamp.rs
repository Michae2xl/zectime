//! ZK Timestamp anchoring helpers on top of [`ZcashRpc`] (Phase T.5).
//!
//! `publish_timestamp` encodes a Poseidon commitment as a
//! [`TimestampMemo`] and broadcasts it as a shielded self-spend. The block
//! height is *not* returned here because it is only known after the tx
//! confirms: callers wait for confirmation and then call
//! [`fetch_timestamp`] with the returned txid to read back
//! `(block_height, commitment)` in a typed [`AnchoredTimestamp`].
//!
//! This module only deals with on-chain plumbing; proof generation stays in
//! [`zectime_prover::timestamp`] and circuit constraints in
//! [`zectime_circuit::timestamp`].

use thiserror::Error;

use super::{BlockHeight, RpcError, TxId, ZcashRpc};
use crate::memo::MemoError;
use crate::timestamp_memo::{decode_timestamp, encode_timestamp, TimestampMemo};

/// Errors produced by the timestamp-specific RPC helpers.
#[derive(Debug, Error)]
pub enum TimestampAnchorError {
    /// Transport / node-level failure surfaced by the underlying [`ZcashRpc`].
    #[error(transparent)]
    Rpc(#[from] RpcError),
    /// The fetched memo blob did not parse as a [`TimestampMemo`].
    #[error("invalid timestamp memo: {0}")]
    Memo(#[from] MemoError),
}

/// A confirmed timestamp anchor as returned by [`fetch_timestamp`].
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AnchoredTimestamp {
    /// Transaction identifier carrying the commitment memo.
    pub txid: TxId,
    /// Block height the transaction was confirmed at. This is the canonical
    /// timestamp of the anchor and should be fed into
    /// [`zectime_prover::timestamp::TimestampWitness::block_height`] for the
    /// corresponding proof.
    pub block_height: BlockHeight,
    /// Poseidon commitment carried by the memo.
    pub commitment: [u8; 32],
}

/// Publish a timestamp commitment on-chain as a shielded memo.
///
/// Returns only the resulting `TxId`: the block height is undefined until the
/// tx confirms. Callers typically wait for confirmation via out-of-band means
/// (e.g. polling `tip_height`) and then call [`fetch_timestamp`] to read back
/// the confirmed `(block_height, commitment)` pair.
pub async fn publish_timestamp(
    rpc: &(impl ZcashRpc + ?Sized),
    commitment: [u8; 32],
) -> Result<TxId, RpcError> {
    let memo = TimestampMemo::new(commitment);
    let blob = encode_timestamp(&memo);
    rpc.broadcast_anchor(&blob).await
}

/// Fetch a previously anchored timestamp by its txid and decode the memo into
/// a typed [`AnchoredTimestamp`].
pub async fn fetch_timestamp(
    rpc: &(impl ZcashRpc + ?Sized),
    txid: &TxId,
) -> Result<AnchoredTimestamp, TimestampAnchorError> {
    let anchored = rpc.fetch_anchor(txid).await?;
    let memo = decode_timestamp(&anchored.memo)?;
    Ok(AnchoredTimestamp {
        txid: anchored.txid,
        block_height: anchored.block_height,
        commitment: memo.commitment,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::memo::{MAGIC, MEMO_LEN};
    use crate::rpc::MockRpc;

    fn sample_commitment() -> [u8; 32] {
        let mut c = [0u8; 32];
        for (i, b) in c.iter_mut().enumerate() {
            *b = (i as u8).wrapping_mul(11).wrapping_add(1);
        }
        c
    }

    #[tokio::test]
    async fn publish_then_fetch_roundtrips_commitment() {
        let rpc = MockRpc::with_tip(2_842_000);
        let commitment = sample_commitment();

        let txid = publish_timestamp(&rpc, commitment).await.expect("publish");
        let anchored = fetch_timestamp(&rpc, &txid).await.expect("fetch");

        assert_eq!(anchored.txid, txid);
        assert_eq!(anchored.commitment, commitment);
        assert_eq!(anchored.block_height, 2_842_001);
    }

    #[tokio::test]
    async fn block_height_matches_confirmation_height() {
        let rpc = MockRpc::with_tip(100);

        let txid_a = publish_timestamp(&rpc, [0xAAu8; 32]).await.unwrap();
        let txid_b = publish_timestamp(&rpc, [0xBBu8; 32]).await.unwrap();

        let a = fetch_timestamp(&rpc, &txid_a).await.unwrap();
        let b = fetch_timestamp(&rpc, &txid_b).await.unwrap();

        assert_eq!(a.block_height, 101);
        assert_eq!(b.block_height, 102);
        assert_ne!(a.txid, b.txid);
    }

    #[tokio::test]
    async fn fetch_unknown_txid_surfaces_rpc_not_found() {
        let rpc = MockRpc::new();
        let err = fetch_timestamp(&rpc, &[0x33u8; 32]).await.unwrap_err();
        assert!(matches!(
            err,
            TimestampAnchorError::Rpc(RpcError::NotFound(_))
        ));
    }

    #[tokio::test]
    async fn fetch_rejects_wrong_version_memo_blob() {
        // Anchor a blob with the shared ZecTime magic but a non-timestamp
        // version. The typed decoder must reject the version mismatch instead
        // of silently returning a zeroed commitment.
        let rpc = MockRpc::new();
        let mut blob = [0u8; MEMO_LEN];
        blob[0..2].copy_from_slice(&MAGIC);
        blob[2] = 0x01;
        let txid = rpc.broadcast_anchor(&blob).await.unwrap();

        let err = fetch_timestamp(&rpc, &txid).await.unwrap_err();
        assert!(matches!(
            err,
            TimestampAnchorError::Memo(MemoError::UnsupportedVersion(0x01))
        ));
    }

    #[tokio::test]
    async fn fetch_rejects_garbage_memo_blob() {
        // Directly inject a garbage memo blob via the raw RPC trait so the
        // decoder sees bytes that lack the "ZC" magic.
        let rpc = MockRpc::new();
        let blob = [0u8; crate::memo::MEMO_LEN];
        let txid = rpc.broadcast_anchor(&blob).await.unwrap();

        let err = fetch_timestamp(&rpc, &txid).await.unwrap_err();
        assert!(matches!(
            err,
            TimestampAnchorError::Memo(MemoError::InvalidMagic { .. })
        ));
    }

    #[tokio::test]
    async fn publish_writes_expected_memo_layout() {
        // Cross-check with the raw trait: publish_timestamp must produce the
        // same 512-byte blob as encode_timestamp(TimestampMemo::new(...)).
        let rpc = MockRpc::new();
        let commitment = sample_commitment();
        let txid = publish_timestamp(&rpc, commitment).await.unwrap();

        let raw = rpc.fetch_anchor(&txid).await.unwrap();
        let expected = encode_timestamp(&TimestampMemo::new(commitment));
        assert_eq!(raw.memo, expected);
    }
}

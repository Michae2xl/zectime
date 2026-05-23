//! In-memory [`ZcashRpc`] mock for tests and CLI dry-runs.

use std::collections::HashMap;
use std::sync::Mutex;

use async_trait::async_trait;

use super::{AnchoredTx, BlockHeight, MemoBlob, RpcError, TxId, ZcashRpc};

/// In-memory mock Zcash node used for tests and CLI dry-runs.
#[derive(Debug, Default)]
pub struct MockRpc {
    state: Mutex<MockState>,
}

#[derive(Debug, Default)]
struct MockState {
    txs: HashMap<TxId, AnchoredTx>,
    tip_height: BlockHeight,
    next_txid: u64,
}

impl MockRpc {
    /// Create an empty mock at chain height 0.
    pub fn new() -> Self {
        Self::default()
    }

    /// Seed the mock with a deterministic starting height.
    pub fn with_tip(height: BlockHeight) -> Self {
        Self {
            state: Mutex::new(MockState {
                txs: HashMap::new(),
                tip_height: height,
                next_txid: 0,
            }),
        }
    }

    fn mint_txid(counter: u64) -> TxId {
        let mut txid = [0u8; 32];
        txid[0..8].copy_from_slice(&counter.to_le_bytes());
        txid
    }
}

#[async_trait]
impl ZcashRpc for MockRpc {
    async fn broadcast_anchor(&self, memo: &MemoBlob) -> Result<TxId, RpcError> {
        let mut state = self
            .state
            .lock()
            .map_err(|e| RpcError::Transport(format!("mock state poisoned: {e}")))?;
        let txid = Self::mint_txid(state.next_txid);
        state.next_txid += 1;
        state.tip_height += 1;
        let anchored = AnchoredTx {
            txid,
            block_height: state.tip_height,
            memo: *memo,
        };
        state.txs.insert(txid, anchored);
        Ok(txid)
    }

    async fn fetch_anchor(&self, txid: &TxId) -> Result<AnchoredTx, RpcError> {
        let state = self
            .state
            .lock()
            .map_err(|e| RpcError::Transport(format!("mock state poisoned: {e}")))?;
        state
            .txs
            .get(txid)
            .cloned()
            .ok_or(RpcError::NotFound(*txid))
    }

    async fn tip_height(&self) -> Result<BlockHeight, RpcError> {
        let state = self
            .state
            .lock()
            .map_err(|e| RpcError::Transport(format!("mock state poisoned: {e}")))?;
        Ok(state.tip_height)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::timestamp_memo::{decode_timestamp, encode_timestamp, TimestampMemo};

    fn sample_blob() -> MemoBlob {
        encode_timestamp(&TimestampMemo::new([7u8; 32]))
    }

    #[tokio::test]
    async fn broadcast_then_fetch_returns_same_blob() {
        let rpc = MockRpc::new();
        let blob = sample_blob();
        let txid = rpc.broadcast_anchor(&blob).await.unwrap();
        let fetched = rpc.fetch_anchor(&txid).await.unwrap();
        assert_eq!(fetched.txid, txid);
        assert_eq!(fetched.memo, blob);
        assert_eq!(fetched.block_height, 1);
    }

    #[tokio::test]
    async fn tip_height_advances_per_broadcast() {
        let rpc = MockRpc::with_tip(100);
        let blob = sample_blob();
        assert_eq!(rpc.tip_height().await.unwrap(), 100);
        rpc.broadcast_anchor(&blob).await.unwrap();
        assert_eq!(rpc.tip_height().await.unwrap(), 101);
        rpc.broadcast_anchor(&blob).await.unwrap();
        assert_eq!(rpc.tip_height().await.unwrap(), 102);
    }

    #[tokio::test]
    async fn fetch_unknown_txid_returns_not_found() {
        let rpc = MockRpc::new();
        let err = rpc.fetch_anchor(&[0xAAu8; 32]).await.unwrap_err();
        assert!(matches!(err, RpcError::NotFound(_)));
    }

    #[tokio::test]
    async fn decode_timestamp_memo_from_anchored_tx() {
        let rpc = MockRpc::new();
        let memo = TimestampMemo::new([9u8; 32]);
        let blob = encode_timestamp(&memo);
        let txid = rpc.broadcast_anchor(&blob).await.unwrap();
        let anchored = rpc.fetch_anchor(&txid).await.unwrap();
        let decoded = decode_timestamp(&anchored.memo).unwrap();
        assert_eq!(decoded, memo);
    }
}

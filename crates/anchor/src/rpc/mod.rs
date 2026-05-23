//! Zcash node RPC abstraction.

use async_trait::async_trait;
use thiserror::Error;

use crate::memo::MEMO_LEN;

pub mod mock;
pub mod timestamp;
pub mod zallet;

pub use mock::MockRpc;
pub use timestamp::{fetch_timestamp, publish_timestamp, AnchoredTimestamp, TimestampAnchorError};
pub use zallet::{Network, ParseNetworkError, ZalletAuth, ZalletConfig, ZalletRpc};

/// Block height on the target Zcash network.
pub type BlockHeight = u64;

/// Opaque 32-byte transaction identifier.
pub type TxId = [u8; 32];

/// Shielded memo blob as stored on-chain.
pub type MemoBlob = [u8; MEMO_LEN];

/// Anchored record returned by [`ZcashRpc::fetch_anchor`].
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AnchoredTx {
    /// Transaction identifier.
    pub txid: TxId,
    /// Confirmed block height.
    pub block_height: BlockHeight,
    /// Raw 512-byte memo blob.
    pub memo: MemoBlob,
}

/// Errors surfaced by a [`ZcashRpc`] implementation.
#[derive(Debug, Error)]
pub enum RpcError {
    /// The requested txid is not known to the node.
    #[error("transaction not found: {}", hex::encode(.0))]
    NotFound(TxId),
    /// Transport or node-level failure.
    #[error("rpc transport error: {0}")]
    Transport(String),
    /// The node accepted the request but returned an unexpected payload.
    #[error("rpc protocol error: {0}")]
    Protocol(String),
    /// Async operation did not finish within the configured deadline.
    #[error("rpc operation timed out: {0}")]
    Timeout(String),
}

/// Minimal RPC surface the anchor layer needs from a Zcash node/wallet.
#[async_trait]
pub trait ZcashRpc: Send + Sync {
    /// Broadcast a memo as a shielded transaction and return its txid.
    async fn broadcast_anchor(&self, memo: &MemoBlob) -> Result<TxId, RpcError>;

    /// Fetch a previously anchored transaction by txid.
    async fn fetch_anchor(&self, txid: &TxId) -> Result<AnchoredTx, RpcError>;

    /// Report the current chain tip height.
    async fn tip_height(&self) -> Result<BlockHeight, RpcError>;
}

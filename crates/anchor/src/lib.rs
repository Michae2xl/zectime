//! Zcash anchoring layer for ZecTime.

#![forbid(unsafe_code)]
#![warn(missing_docs)]

pub mod memo;
pub mod rpc;
pub mod timestamp_memo;

pub use memo::{MemoError, MAGIC, MEMO_LEN};
pub use rpc::{
    fetch_timestamp, publish_timestamp, AnchoredTimestamp, AnchoredTx, BlockHeight, MemoBlob,
    MockRpc, Network, ParseNetworkError, RpcError, TimestampAnchorError, TxId, ZalletAuth,
    ZalletConfig, ZalletRpc, ZcashRpc,
};
pub use timestamp_memo::{decode_timestamp, encode_timestamp, TimestampMemo, TIMESTAMP_VERSION};

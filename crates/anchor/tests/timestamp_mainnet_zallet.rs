//! Gated ZK Timestamp end-to-end test against a live mainnet zallet wallet.
//!
//! This spends real ZEC. It is ignored by default and requires
//! `ZECTIME_TIMESTAMP_MAINNET=1`. The test can reuse a local zallet instance
//! wallet env directly: `ZALLET_RPC_URL`, `ZALLET_FROM_ADDRESS`,
//! `ZALLET_RPC_USER`, `ZALLET_RPC_PASSWORD`, and `ZCASH_NETWORK=mainnet`.

use std::env;
use std::time::Duration;

use tokio::time::{sleep, Instant};
use zectime_anchor::{
    fetch_timestamp, publish_timestamp, Network, TimestampAnchorError, TxId, ZalletAuth,
    ZalletConfig, ZalletRpc,
};

fn enabled() -> bool {
    env::var("ZECTIME_TIMESTAMP_MAINNET").ok().as_deref() == Some("1")
}

fn env_first(primary: &str, fallback: &str) -> Option<String> {
    env::var(primary).ok().or_else(|| env::var(fallback).ok())
}

fn required(primary: &str, fallback: &str) -> String {
    env_first(primary, fallback)
        .unwrap_or_else(|| panic!("{primary} or {fallback} must be set for timestamp mainnet E2E"))
}

fn timeout() -> Duration {
    env::var("ZECTIME_TIMESTAMP_MAINNET_TIMEOUT_SECS")
        .ok()
        .and_then(|raw| raw.parse::<u64>().ok())
        .map(Duration::from_secs)
        .unwrap_or_else(|| Duration::from_secs(900))
}

async fn fetch_confirmed_timestamp(
    rpc: &ZalletRpc,
    txid: &TxId,
) -> Result<zectime_anchor::AnchoredTimestamp, TimestampAnchorError> {
    let deadline = Instant::now() + timeout();
    let mut last_error = None;

    while Instant::now() <= deadline {
        match fetch_timestamp(rpc, txid).await {
            Ok(anchor) => return Ok(anchor),
            Err(error) => {
                last_error = Some(error);
                sleep(Duration::from_secs(10)).await;
            }
        }
    }

    Err(last_error.unwrap_or_else(|| {
        TimestampAnchorError::Rpc(zectime_anchor::RpcError::Timeout(
            "timestamp anchor was not confirmed before timeout".to_string(),
        ))
    }))
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "spends real ZEC against live mainnet zallet"]
async fn publish_and_fetch_timestamp_against_voting_zallet_mainnet() {
    if !enabled() {
        eprintln!("skipping: ZECTIME_TIMESTAMP_MAINNET=1 not set");
        return;
    }

    let network = env::var("ZCASH_NETWORK").unwrap_or_else(|_| "mainnet".to_string());
    assert_eq!(
        network, "mainnet",
        "the voting zallet env must be pointed at mainnet"
    );

    let url = required("ZECTIME_TIMESTAMP_MAINNET_RPC_URL", "ZALLET_RPC_URL")
        .parse()
        .expect("zallet RPC URL must be valid");
    let from_address = required(
        "ZECTIME_TIMESTAMP_MAINNET_FROM_ADDRESS",
        "ZALLET_FROM_ADDRESS",
    );

    let mut config = ZalletConfig::for_network(Network::Mainnet, url, from_address);
    if let Some(user) = env_first("ZECTIME_TIMESTAMP_MAINNET_RPC_USER", "ZALLET_RPC_USER") {
        let password = env_first(
            "ZECTIME_TIMESTAMP_MAINNET_RPC_PASSWORD",
            "ZALLET_RPC_PASSWORD",
        )
        .unwrap_or_default();
        config = config.with_auth(ZalletAuth { user, password });
    }
    config.poll_timeout = timeout();

    let rpc = ZalletRpc::new(config).expect("build ZalletRpc");
    let commitment = [0x54u8; 32];

    let txid = publish_timestamp(&rpc, commitment)
        .await
        .expect("publish timestamp");
    eprintln!("timestamp mainnet txid: {}", hex::encode(txid));

    let anchored = fetch_confirmed_timestamp(&rpc, &txid)
        .await
        .expect("fetch confirmed timestamp");

    assert_eq!(anchored.txid, txid);
    assert_eq!(anchored.commitment, commitment);
    assert!(anchored.block_height > 0);
    eprintln!("timestamp mainnet height: {}", anchored.block_height);
}

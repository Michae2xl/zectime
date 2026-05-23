//! HTTP JSON-RPC client for [zallet](https://github.com/zcash/wallet).
//!
//! Implements [`ZcashRpc`] by composing a self-spend shielded transaction
//! through zallet's `z_sendmany` → async-op → `z_viewtransaction` flow.
//!
//! Zallet's RPC is wallet-only; chain-info methods like `getblockchaininfo`
//! are not exposed. When `tip_height` is required (integration tests), point
//! [`ZalletConfig::with_validator`] at the backing zebrad/zcashd JSON-RPC
//! endpoint so tip queries are proxied directly to the validator.
//!
//! The wire surface mirrors zcashd's wallet RPC (which zallet ports from).
//! We document the exact params + return shape we rely on inline; Phase 4b's
//! regtest integration test is the first thing that exercises the real wire
//! format end-to-end.

use std::path::{Path, PathBuf};
use std::time::Duration;

use async_trait::async_trait;
use reqwest::{Client, Url};
use rusqlite::{params, Connection, OpenFlags, OptionalExtension};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::time::{sleep, Instant};

use super::{AnchoredTx, BlockHeight, MemoBlob, RpcError, TxId, ZcashRpc};
use crate::memo::MEMO_LEN;

/// Credentials for zallet's HTTP basic auth.
///
/// Zallet provisions these via `zallet add-rpc-user` and stores them in its
/// config; the caller pulls them at startup from the same source.
#[derive(Clone, Debug)]
pub struct ZalletAuth {
    /// Username.
    pub user: String,
    /// Password.
    pub password: String,
}

/// Target Zcash network for a [`ZalletRpc`] instance.
///
/// Drives confirmation/timeout defaults and gives the config helper a hook
/// to cross-check the configured `from_address` prefix.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Network {
    /// Local regtest — instant block generation, single confirmation is safe.
    #[default]
    Regtest,
    /// Public testnet — real cadence (~75s blocks), recommend ≥3 confirmations.
    Testnet,
    /// Mainnet — real ZEC. Single-confirmation anchors are safe here
    /// because the timestamp commitment itself is immutable: if the anchor
    /// tx is reorged out, the issuer simply re-broadcasts the same memo.
    /// The nullifier inside the memo replay-protects against double-use.
    Mainnet,
}

impl Network {
    /// Confirmations required on spent notes for this network.
    pub fn default_minconf(self) -> u32 {
        match self {
            Self::Regtest => 1,
            Self::Testnet => 3,
            Self::Mainnet => 1,
        }
    }

    /// Poll timeout appropriate for this network's Orchard proof cadence.
    pub fn default_poll_timeout(self) -> Duration {
        match self {
            Self::Regtest => Duration::from_secs(120),
            Self::Testnet => Duration::from_secs(300),
            Self::Mainnet => Duration::from_secs(600),
        }
    }

    /// Expected unified-address prefix(es) for this network.
    ///
    /// Used as a soft guardrail: mismatch logs a warning but does not fail,
    /// because single-pool and legacy encodings use other prefixes that are
    /// out of scope for this crate.
    pub fn address_prefixes(self) -> &'static [&'static str] {
        match self {
            Self::Regtest => &["uregtest1"],
            Self::Testnet => &["utest1", "ztestsapling1"],
            Self::Mainnet => &["u1", "zs1"],
        }
    }

    /// Parse the human-readable network name used by `ZECTIME_NETWORK` and
    /// the CLI `--network` flag.
    pub fn parse(s: &str) -> Result<Self, ParseNetworkError> {
        match s {
            "regtest" => Ok(Self::Regtest),
            "testnet" => Ok(Self::Testnet),
            "mainnet" => Ok(Self::Mainnet),
            other => Err(ParseNetworkError(other.to_string())),
        }
    }

    /// Canonical name used in config files and CLI flags.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Regtest => "regtest",
            Self::Testnet => "testnet",
            Self::Mainnet => "mainnet",
        }
    }
}

/// Error returned by [`Network::parse`].
#[derive(Debug, thiserror::Error)]
#[error("unknown network `{0}`; expected one of regtest|testnet|mainnet")]
pub struct ParseNetworkError(String);

impl std::str::FromStr for Network {
    type Err = ParseNetworkError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Self::parse(s)
    }
}

impl std::fmt::Display for Network {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

/// Configuration for a [`ZalletRpc`] instance.
#[derive(Clone, Debug)]
pub struct ZalletConfig {
    /// Base URL for the zallet JSON-RPC endpoint (e.g. `http://127.0.0.1:18232/`).
    pub url: Url,
    /// Optional basic-auth credentials.
    pub auth: Option<ZalletAuth>,
    /// Target network — drives `minconf` and `poll_timeout` defaults and is
    /// used as a sanity check against the configured `from_address` prefix.
    pub network: Network,
    /// Unified address that both sends and receives the self-spend anchor.
    pub from_address: String,
    /// Amount (in ZEC) to send to `from_address` as the anchor payload.
    ///
    /// Must be `> 0`; `0.00000001` (1 zat) keeps the self-spend cheap while
    /// still producing a real Orchard output that carries the memo.
    pub send_amount_zec: f64,
    /// Minimum confirmations required on spent notes.
    pub minconf: u32,
    /// Interval between async-op status polls.
    pub poll_interval: Duration,
    /// Upper bound for how long to wait for an async op to finish.
    pub poll_timeout: Duration,
    /// zallet privacy policy for z_sendmany (`FullPrivacy`,
    /// `AllowRevealedSenders`, etc.).
    pub privacy_policy: String,
    /// Optional JSON-RPC endpoint of the backing zebrad/zcashd validator.
    ///
    /// Zallet does not expose chain-info methods, so [`ZalletRpc::tip_height`]
    /// proxies to this URL when set. Leave `None` when tip queries are not
    /// required by the caller.
    pub validator_url: Option<Url>,
    /// Optional basic-auth credentials for [`Self::validator_url`].
    pub validator_auth: Option<ZalletAuth>,
    /// Optional local path to zallet's wallet database. Used only as a
    /// read-only fallback for zallet alpha versions whose `z_viewtransaction`
    /// / `z_listtransactions` paths fail on binary memos.
    pub wallet_db_path: Option<PathBuf>,
}

impl ZalletConfig {
    /// Construct a regtest-friendly config with sensible defaults.
    ///
    /// Use [`ZalletConfig::for_network`] or [`ZalletConfig::with_network`] to
    /// target testnet or mainnet with the confirmation/timeout defaults
    /// appropriate for that network.
    pub fn new(url: Url, from_address: impl Into<String>) -> Self {
        Self::for_network(Network::Regtest, url, from_address)
    }

    /// Construct a config targeting `network` with that network's defaults.
    pub fn for_network(network: Network, url: Url, from_address: impl Into<String>) -> Self {
        Self {
            url,
            auth: None,
            network,
            from_address: from_address.into(),
            send_amount_zec: 0.000_000_01,
            minconf: network.default_minconf(),
            poll_interval: Duration::from_secs(1),
            poll_timeout: network.default_poll_timeout(),
            privacy_policy: "FullPrivacy".to_string(),
            validator_url: None,
            validator_auth: None,
            wallet_db_path: None,
        }
    }

    /// Attach basic-auth credentials.
    pub fn with_auth(mut self, auth: ZalletAuth) -> Self {
        self.auth = Some(auth);
        self
    }

    /// Route chain-info queries (currently just `tip_height`) to the backing
    /// zebrad/zcashd JSON-RPC endpoint.
    pub fn with_validator(mut self, url: Url, auth: Option<ZalletAuth>) -> Self {
        self.validator_url = Some(url);
        self.validator_auth = auth;
        self
    }

    /// Attach a read-only fallback path to zallet's wallet database.
    pub fn with_wallet_db_path(mut self, path: impl Into<PathBuf>) -> Self {
        self.wallet_db_path = Some(path.into());
        self
    }

    /// Switch the target network and reset `minconf` / `poll_timeout` to the
    /// defaults for that network.
    ///
    /// Leaves explicitly-set fields (`send_amount_zec`, `privacy_policy`,
    /// `auth`, `poll_interval`) untouched so callers can tune them after.
    pub fn with_network(mut self, network: Network) -> Self {
        self.network = network;
        self.minconf = network.default_minconf();
        self.poll_timeout = network.default_poll_timeout();
        self
    }
}

/// JSON-RPC client targeting a running zallet instance.
pub struct ZalletRpc {
    client: Client,
    config: ZalletConfig,
}

#[derive(Serialize)]
struct RpcRequest<'a> {
    jsonrpc: &'a str,
    id: &'a str,
    method: &'a str,
    params: Value,
}

#[derive(Deserialize)]
struct RpcResponse<T> {
    result: Option<T>,
    error: Option<RpcErrorBody>,
}

#[derive(Deserialize, Debug)]
struct RpcErrorBody {
    #[allow(dead_code)]
    code: i64,
    message: String,
}

#[derive(Deserialize)]
struct ChainInfo {
    blocks: BlockHeight,
}

#[derive(Deserialize)]
struct OperationStatus {
    #[serde(default)]
    id: String,
    status: String,
    #[serde(default)]
    result: Option<OperationResult>,
    #[serde(default)]
    error: Option<OperationErrorBody>,
}

#[derive(Deserialize)]
struct OperationResult {
    txid: String,
}

#[derive(Deserialize)]
struct OperationErrorBody {
    #[allow(dead_code)]
    code: Option<i64>,
    message: String,
}

/// `z_viewtransaction` response (trimmed to the fields we consume).
///
/// zallet returns one entry per shielded output; we match on the memo field
/// and grab the first one that parses as our 512-byte memo.
#[derive(Deserialize)]
struct ViewTxResponse {
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    height: Option<BlockHeight>,
    #[serde(default)]
    outputs: Vec<ViewTxOutput>,
}

#[derive(Deserialize)]
struct ViewTxOutput {
    #[serde(default)]
    #[allow(dead_code)]
    pool: Option<String>,
    /// Raw hex-encoded memo bytes (per Orchard output).
    #[serde(default)]
    memo: Option<String>,
}

impl ZalletRpc {
    /// Construct a new client. Returns an error if the HTTP client cannot be
    /// built (e.g. invalid TLS configuration in the host environment).
    ///
    /// Logs a warning when `config.from_address` does not start with a
    /// prefix expected for `config.network` — misconfiguration between
    /// regtest addresses and a testnet/mainnet endpoint is the most common
    /// deployment mistake, and zallet's `z_sendmany` error message is
    /// opaque when this happens.
    pub fn new(config: ZalletConfig) -> Result<Self, RpcError> {
        let client = Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|e| RpcError::Transport(format!("reqwest client build: {e}")))?;

        if !config.from_address.is_empty()
            && !config
                .network
                .address_prefixes()
                .iter()
                .any(|p| config.from_address.starts_with(p))
        {
            tracing::warn!(
                network = config.network.as_str(),
                from_address = %redact_address(&config.from_address),
                expected_prefixes = ?config.network.address_prefixes(),
                "from_address prefix does not match the configured network"
            );
        }

        Ok(Self { client, config })
    }

    async fn call<R>(&self, method: &str, params: Value) -> Result<R, RpcError>
    where
        R: DeserializeOwned,
    {
        self.call_at(&self.config.url, self.config.auth.as_ref(), method, params)
            .await
    }

    async fn call_at<R>(
        &self,
        url: &Url,
        auth: Option<&ZalletAuth>,
        method: &str,
        params: Value,
    ) -> Result<R, RpcError>
    where
        R: DeserializeOwned,
    {
        let body = RpcRequest {
            jsonrpc: "1.0",
            id: "zectime",
            method,
            params,
        };

        let mut request = self.client.post(url.clone()).json(&body);
        if let Some(auth) = auth {
            request = request.basic_auth(&auth.user, Some(&auth.password));
        }

        let response = request
            .send()
            .await
            .map_err(|e| RpcError::Transport(format!("{method} request failed: {e}")))?;

        let status = response.status();
        let bytes = response
            .bytes()
            .await
            .map_err(|e| RpcError::Transport(format!("{method} body read failed: {e}")))?;

        if !status.is_success() {
            let body = String::from_utf8_lossy(&bytes).into_owned();
            return Err(RpcError::Transport(format!(
                "{method} returned HTTP {status}: {body}"
            )));
        }

        let parsed: RpcResponse<R> = serde_json::from_slice(&bytes).map_err(|e| {
            RpcError::Protocol(format!(
                "{method} response parse failed: {e} (body: {})",
                String::from_utf8_lossy(&bytes)
            ))
        })?;

        if let Some(err) = parsed.error {
            return Err(RpcError::Protocol(format!(
                "{method} rejected by node: {}",
                err.message
            )));
        }

        parsed
            .result
            .ok_or_else(|| RpcError::Protocol(format!("{method} returned no result")))
    }

    async fn poll_operation(&self, operation_id: &str) -> Result<TxId, RpcError> {
        let deadline = Instant::now() + self.config.poll_timeout;
        loop {
            let statuses: Vec<OperationStatus> = self
                .call("z_getoperationstatus", json!([[operation_id]]))
                .await?;

            let status = statuses.into_iter().find(|s| s.id == operation_id);
            if let Some(status) = status {
                match status.status.as_str() {
                    "success" => {
                        let result = status.result.ok_or_else(|| {
                            RpcError::Protocol(
                                "z_getoperationstatus success with no result".to_string(),
                            )
                        })?;
                        return parse_txid(&result.txid);
                    }
                    "failed" => {
                        let msg = status.error.map(|e| e.message).unwrap_or_else(|| {
                            "operation failed without error message".to_string()
                        });
                        return Err(RpcError::Protocol(format!("z_sendmany failed: {msg}")));
                    }
                    "queued" | "executing" => {}
                    other => {
                        return Err(RpcError::Protocol(format!(
                            "unknown operation status: {other}"
                        )));
                    }
                }
            }

            if Instant::now() >= deadline {
                return Err(RpcError::Timeout(format!(
                    "operation {operation_id} did not finish within {:?}",
                    self.config.poll_timeout
                )));
            }
            sleep(self.config.poll_interval).await;
        }
    }
}

#[async_trait]
impl ZcashRpc for ZalletRpc {
    async fn broadcast_anchor(&self, memo: &MemoBlob) -> Result<TxId, RpcError> {
        let memo_hex = hex::encode(memo);
        let params = json!([
            self.config.from_address,
            [{
                "address": self.config.from_address,
                "amount": self.config.send_amount_zec,
                "memo": memo_hex,
            }],
            self.config.minconf,
            null,
            self.config.privacy_policy,
        ]);

        let operation_id: String = self.call("z_sendmany", params).await?;
        self.poll_operation(&operation_id).await
    }

    async fn fetch_anchor(&self, txid: &TxId) -> Result<AnchoredTx, RpcError> {
        let txid_hex = hex::encode(txid);
        let response_result: Result<ViewTxResponse, RpcError> = self
            .call("z_viewtransaction", json!([txid_hex]))
            .await
            .map_err(|e| match e {
                RpcError::Protocol(msg) if msg.contains("not found") => RpcError::NotFound(*txid),
                other => other,
            });

        let response = match response_result {
            Ok(response) => response,
            Err(error)
                if self.config.wallet_db_path.is_some() && is_zallet_alpha_fetch_bug(&error) =>
            {
                return self.fetch_anchor_from_wallet_db(txid).map_err(|fallback_error| {
                    RpcError::Protocol(format!(
                        "z_viewtransaction failed ({error}); wallet DB fallback failed ({fallback_error})"
                    ))
                });
            }
            Err(error) => return Err(error),
        };

        let block_height = response.height.ok_or_else(|| {
            RpcError::Protocol(format!(
                "z_viewtransaction did not return a height (status={:?})",
                response.status
            ))
        })?;

        let memo = response
            .outputs
            .iter()
            .filter_map(|o| o.memo.as_deref())
            .filter_map(|hex_str| decode_memo_hex(hex_str).ok())
            .next()
            .ok_or_else(|| {
                RpcError::Protocol("z_viewtransaction returned no 512-byte memo output".to_string())
            })?;

        Ok(AnchoredTx {
            txid: *txid,
            block_height,
            memo,
        })
    }

    async fn tip_height(&self) -> Result<BlockHeight, RpcError> {
        let validator_url = self.config.validator_url.as_ref().ok_or_else(|| {
            RpcError::Protocol(
                "tip_height requires ZalletConfig::with_validator(...) — zallet's RPC does \
                 not expose getblockchaininfo"
                    .to_string(),
            )
        })?;
        let info: ChainInfo = self
            .call_at(
                validator_url,
                self.config.validator_auth.as_ref(),
                "getblockchaininfo",
                json!([]),
            )
            .await?;
        Ok(info.blocks)
    }
}

fn parse_txid(s: &str) -> Result<TxId, RpcError> {
    let bytes =
        hex::decode(s).map_err(|e| RpcError::Protocol(format!("invalid txid hex `{s}`: {e}")))?;
    bytes.as_slice().try_into().map_err(|_| {
        RpcError::Protocol(format!(
            "txid hex `{s}` decoded to {} bytes; expected 32",
            bytes.len()
        ))
    })
}

impl ZalletRpc {
    fn fetch_anchor_from_wallet_db(&self, txid: &TxId) -> Result<AnchoredTx, RpcError> {
        let path = self.config.wallet_db_path.as_ref().ok_or_else(|| {
            RpcError::Protocol("wallet DB fallback requires wallet_db_path".to_string())
        })?;
        fetch_anchor_from_zallet_wallet_db(path, txid)
    }
}

fn is_zallet_alpha_fetch_bug(error: &RpcError) -> bool {
    match error {
        RpcError::Protocol(message) | RpcError::Transport(message) => {
            message.contains("no such column: tx")
                || message.contains("Invalid memo data")
                || message.contains("InvalidUtf8")
        }
        RpcError::NotFound(_) | RpcError::Timeout(_) => false,
    }
}

fn fetch_anchor_from_zallet_wallet_db(path: &Path, txid: &TxId) -> Result<AnchoredTx, RpcError> {
    let conn =
        Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY).map_err(|e| {
            RpcError::Transport(format!("open zallet wallet DB at {}: {e}", path.display()))
        })?;

    let mut db_txid = *txid;
    db_txid.reverse();

    let mut stmt = conn
        .prepare(
            r#"
            SELECT mined_height, memo
            FROM (
              SELECT t.mined_height AS mined_height, sn.output_index AS output_index, sn.memo AS memo
              FROM transactions t
              JOIN sent_notes sn ON sn.transaction_id = t.id_tx
              WHERE t.txid = ?1
              UNION ALL
              SELECT t.mined_height AS mined_height, orn.action_index AS output_index, orn.memo AS memo
              FROM transactions t
              JOIN orchard_received_notes orn ON orn.transaction_id = t.id_tx
              WHERE t.txid = ?1
            )
            WHERE memo IS NOT NULL
              AND length(memo) > 0
              AND substr(memo, 1, 2) = x'5A43'
            ORDER BY output_index ASC
            LIMIT 1
            "#,
        )
        .map_err(|e| RpcError::Protocol(format!("prepare wallet DB fallback query: {e}")))?;

    let row: Option<(Option<i64>, Vec<u8>)> = stmt
        .query_row(params![db_txid.as_slice()], |row| {
            Ok((row.get(0)?, row.get(1)?))
        })
        .optional()
        .map_err(|e| RpcError::Protocol(format!("query wallet DB fallback: {e}")))?;

    let (height, memo_bytes) = row.ok_or_else(|| RpcError::NotFound(*txid))?;
    let height = height.ok_or_else(|| {
        RpcError::Protocol("wallet DB fallback found tx but it is not mined".to_string())
    })?;
    if height < 0 {
        return Err(RpcError::Protocol(format!(
            "wallet DB fallback returned negative mined_height {height}"
        )));
    }

    Ok(AnchoredTx {
        txid: *txid,
        block_height: height as BlockHeight,
        memo: expand_compact_memo(memo_bytes)?,
    })
}

fn expand_compact_memo(bytes: Vec<u8>) -> Result<MemoBlob, RpcError> {
    if bytes.len() > MEMO_LEN {
        return Err(RpcError::Protocol(format!(
            "wallet DB memo length {} exceeds {MEMO_LEN}",
            bytes.len()
        )));
    }

    let mut out = [0u8; MEMO_LEN];
    out[..bytes.len()].copy_from_slice(&bytes);
    Ok(out)
}

/// Shorten a unified address for log output so diagnostics don't leak the
/// full string. Keeps the prefix (network discriminator) plus a trailing
/// fingerprint.
fn redact_address(addr: &str) -> String {
    const TAIL: usize = 6;
    if addr.len() <= 12 + TAIL {
        return addr.to_string();
    }
    let (head, _) = addr.split_at(12);
    let tail_start = addr.len() - TAIL;
    format!("{head}…{}", &addr[tail_start..])
}

fn decode_memo_hex(hex_str: &str) -> Result<MemoBlob, RpcError> {
    let bytes =
        hex::decode(hex_str).map_err(|e| RpcError::Protocol(format!("memo hex decode: {e}")))?;
    if bytes.len() != MEMO_LEN {
        return Err(RpcError::Protocol(format!(
            "memo length {} != {MEMO_LEN}",
            bytes.len()
        )));
    }
    let mut out = [0u8; MEMO_LEN];
    out.copy_from_slice(&bytes);
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_txid_accepts_valid_hex() {
        let hex = "0011223344556677889900112233445566778899001122334455667788990011";
        let txid = parse_txid(hex).expect("valid txid");
        assert_eq!(txid[0], 0x00);
        assert_eq!(txid[1], 0x11);
        assert_eq!(txid[31], 0x11);
    }

    #[test]
    fn parse_txid_rejects_wrong_length() {
        let err = parse_txid("00112233").expect_err("too short must fail");
        assert!(matches!(err, RpcError::Protocol(_)));
    }

    #[test]
    fn parse_txid_rejects_non_hex() {
        let err = parse_txid("zzzz").expect_err("non-hex must fail");
        assert!(matches!(err, RpcError::Protocol(_)));
    }

    #[test]
    fn decode_memo_hex_requires_exact_length() {
        let hex = "00".repeat(MEMO_LEN);
        let memo = decode_memo_hex(&hex).expect("matching length ok");
        assert_eq!(memo, [0u8; MEMO_LEN]);

        let err = decode_memo_hex("00").expect_err("short memo must fail");
        assert!(matches!(err, RpcError::Protocol(_)));
    }

    #[test]
    fn zallet_config_defaults_are_sane() {
        let url = "http://127.0.0.1:18232/".parse().unwrap();
        let cfg = ZalletConfig::new(url, "uregtest1...");
        assert_eq!(cfg.network, Network::Regtest);
        assert_eq!(cfg.minconf, 1);
        assert_eq!(cfg.poll_timeout, Duration::from_secs(120));
        assert_eq!(cfg.privacy_policy, "FullPrivacy");
        assert!(cfg.send_amount_zec > 0.0);
    }

    #[test]
    fn for_testnet_tightens_minconf_and_timeout() {
        let url = "https://testnet.example.com/".parse().unwrap();
        let cfg = ZalletConfig::for_network(Network::Testnet, url, "utest1abc");
        assert_eq!(cfg.network, Network::Testnet);
        assert_eq!(cfg.minconf, 3);
        assert_eq!(cfg.poll_timeout, Duration::from_secs(300));
    }

    #[test]
    fn with_validator_stores_url_and_auth_without_touching_wallet_fields() {
        let url = "http://127.0.0.1:18232/".parse().unwrap();
        let validator_url = "http://127.0.0.1:8232/".parse().unwrap();
        let cfg = ZalletConfig::new(url, "uregtest1xyz")
            .with_auth(ZalletAuth {
                user: "wallet".into(),
                password: "wp".into(),
            })
            .with_validator(
                validator_url,
                Some(ZalletAuth {
                    user: "zebra".into(),
                    password: "vp".into(),
                }),
            );
        assert!(cfg.validator_url.is_some());
        let validator_auth = cfg.validator_auth.as_ref().unwrap();
        assert_eq!(validator_auth.user, "zebra");
        // wallet auth untouched
        let wallet_auth = cfg.auth.as_ref().unwrap();
        assert_eq!(wallet_auth.user, "wallet");
    }

    #[test]
    fn wallet_db_fallback_reads_compact_zallet_memo() {
        let dir =
            std::env::temp_dir().join(format!("zectime-zallet-db-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).expect("create temp test dir");
        let db_path = dir.join("wallet.db");
        let conn = Connection::open(&db_path).expect("open test db");
        conn.execute_batch(
            r#"
            CREATE TABLE transactions (
              id_tx INTEGER PRIMARY KEY,
              txid BLOB NOT NULL,
              mined_height INTEGER
            );
            CREATE TABLE sent_notes (
              transaction_id INTEGER NOT NULL,
              output_pool INTEGER NOT NULL,
              output_index INTEGER NOT NULL,
              memo BLOB
            );
            CREATE TABLE orchard_received_notes (
              transaction_id INTEGER NOT NULL,
              action_index INTEGER NOT NULL,
              memo BLOB
            );
            "#,
        )
        .expect("create schema");

        let txid = [0x42u8; 32];
        let mut db_txid = txid;
        db_txid.reverse();
        let mut compact_memo = Vec::from([0x5a, 0x43, 0x02]);
        compact_memo.extend([0x54u8; 32]);

        conn.execute(
            "INSERT INTO transactions (id_tx, txid, mined_height) VALUES (1, ?1, 3351867)",
            params![db_txid.as_slice()],
        )
        .expect("insert tx");
        conn.execute(
            "INSERT INTO sent_notes (transaction_id, output_pool, output_index, memo) VALUES (1, 3, 0, ?1)",
            params![compact_memo],
        )
        .expect("insert memo");
        drop(conn);

        let anchored =
            fetch_anchor_from_zallet_wallet_db(&db_path, &txid).expect("fetch from wallet db");
        assert_eq!(anchored.txid, txid);
        assert_eq!(anchored.block_height, 3_351_867);
        assert_eq!(&anchored.memo[..3], &[0x5a, 0x43, 0x02]);
        assert_eq!(&anchored.memo[3..35], &[0x54u8; 32]);
        assert!(anchored.memo[35..].iter().all(|b| *b == 0));

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn with_network_switches_defaults_without_touching_auth() {
        let url = "http://127.0.0.1:18232/".parse().unwrap();
        let cfg = ZalletConfig::new(url, "uregtest1xyz").with_auth(ZalletAuth {
            user: "u".into(),
            password: "p".into(),
        });
        let promoted = cfg.clone().with_network(Network::Mainnet);
        assert_eq!(promoted.network, Network::Mainnet);
        assert_eq!(promoted.minconf, 1);
        assert_eq!(promoted.poll_timeout, Duration::from_secs(600));
        assert!(promoted.auth.is_some(), "auth should survive with_network");
        // original is untouched
        assert_eq!(cfg.network, Network::Regtest);
    }

    #[test]
    fn network_parse_accepts_canonical_names() {
        assert_eq!(Network::parse("regtest").unwrap(), Network::Regtest);
        assert_eq!(Network::parse("testnet").unwrap(), Network::Testnet);
        assert_eq!(Network::parse("mainnet").unwrap(), Network::Mainnet);
        assert!(Network::parse("Regtest").is_err());
        assert!(Network::parse("").is_err());
    }

    #[test]
    fn network_prefixes_cover_unified_addresses() {
        assert!(Network::Regtest
            .address_prefixes()
            .iter()
            .any(|p| "uregtest1foo".starts_with(p)));
        assert!(Network::Testnet
            .address_prefixes()
            .iter()
            .any(|p| "utest1bar".starts_with(p)));
        assert!(Network::Mainnet
            .address_prefixes()
            .iter()
            .any(|p| "u1baz".starts_with(p)));
    }

    #[test]
    fn redact_address_preserves_prefix_and_tail_for_long_addresses() {
        let addr = "utest1abcdefghijklmnopqrstuvwxyz012345";
        let redacted = redact_address(addr);
        assert!(redacted.starts_with("utest1abcdef"));
        assert!(redacted.contains('…'));
        assert!(redacted.ends_with("012345"));
        assert!(redacted.len() < addr.len());
    }

    #[test]
    fn redact_address_returns_short_input_unchanged() {
        assert_eq!(redact_address("short"), "short");
    }
}

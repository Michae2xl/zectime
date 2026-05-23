# Operations

## Local Web

```bash
cargo build
cd apps/web
npm install
npm run dev
```

Open `http://localhost:3000/timestamp`.

The console has two primary actions:

- Generate ZK Receipt
- Verify ZK Receipt

## Environment

```bash
ZECTIME_CLI_BIN=../../target/debug/zectime
ZECTIME_PARAMS_PATH=../../tmp/web-params.bin
ZECTIME_PREDICATE_PARAMS_PATH=../../tmp/web-predicate-params.bin
ZECTIME_WEB_RUNTIME_DIR=../../tmp/web-runtime
ZECTIME_NETWORK=mainnet
ZECTIME_CLI_TIMEOUT_MS=900000
ZECTIME_RPC_URL=http://127.0.0.1:28232/
ZECTIME_FROM_ADDRESS=<zallet-unified-address>
ZECTIME_RPC_USER=<optional-rpc-user>
ZECTIME_RPC_PASSWORD=<optional-rpc-password>
ZECTIME_WALLET_DB_PATH=<optional-zallet-wallet-db>
ZECTIME_PUBLIC_STAMP_DAILY_LIMIT=25
ZECTIME_PUBLIC_STAMP_IP_DAILY_LIMIT=3
ZECTIME_PUBLIC_STAMP_CONCURRENCY=1
ZECTIME_PUBLIC_STAMP_BUDGET_PATH=../../tmp/web-runtime/public-stamp-budget.json
ZECTIME_TRUST_PROXY_HEADERS=0
ZECTIME_UPSTASH_REDIS_REST_URL=<optional-upstash-rest-url>
ZECTIME_UPSTASH_REDIS_REST_TOKEN=<optional-upstash-rest-token>
```

`ZECTIME_WALLET_DB_PATH` is only needed for the current zallet alpha fetch fallback when the app can read the local wallet database.

`ZECTIME_PUBLIC_STAMP_*` caps public mainnet generation so a public website cannot spend unlimited wallet funds. The default is 25 anchors per day globally, 3 per client IP per day, and 1 active zallet publish at a time.

For a single-instance pilot, put `ZECTIME_PUBLIC_STAMP_BUDGET_PATH` on persistent storage. For a multi-instance deployment, configure `ZECTIME_UPSTASH_REDIS_REST_URL` and `ZECTIME_UPSTASH_REDIS_REST_TOKEN`; the app will use Redis `INCR` counters instead of the local JSON file.

Keep `ZECTIME_TRUST_PROXY_HEADERS=0` unless the app is behind infrastructure that owns and sanitizes `X-Forwarded-For` / `X-Real-IP`. When it is `0`, all public clients share the same conservative IP bucket.

## zallet Alpha Fetch Fallback

ZecTime anchors commitments through `z_sendmany` and verifies anchors through `z_viewtransaction`.

Some zallet `0.1.0-alpha.3` deployments can broadcast the transaction successfully but fail when reading binary Orchard memos through `z_viewtransaction`, returning errors such as `no such column: tx` or invalid UTF-8 memo decoding.

There are two supported fallbacks:

- If the web app runs on the same machine as zallet, set `ZECTIME_WALLET_DB_PATH` so the Rust anchor client can read `wallet.db` in read-only mode.
- If the web app runs elsewhere, run the proxy in `ops/zallet-rpc-proxy.py` next to zallet and point `ZECTIME_RPC_URL` at the proxy. The proxy forwards normal RPC calls and only serves `z_viewtransaction` from the local wallet database when the known zallet alpha fetch bug appears.

Example:

```bash
python3 ops/zallet-rpc-proxy.py \
  --listen 127.0.0.1 \
  --port 29232 \
  --upstream http://127.0.0.1:28232/ \
  --wallet-db /media/zebra-ssd/zallet-data/wallet.db
```

Then set:

```bash
ZECTIME_RPC_URL=http://127.0.0.1:29232/
```

Keep the proxy bound to localhost or a private tunnel. It refuses non-loopback bind addresses unless `--allow-remote` is passed. Only use `--allow-remote` behind a firewall or private tunnel because the proxy forwards zallet RPC calls.

## Public API Privacy Boundaries

`/api/timestamps/stamp` accepts only a 32-byte blinded commitment. It does not accept the file, nonce, document hash, or private opening.

`/api/timestamps/anchor` is retired and returns `410`. It is kept only as a stable error for old clients, because accepting full receipts would let users accidentally send private opening material to the backend.

`/api/timestamps/fetch` accepts a public receipt or full bundle, but extracts only public receipt fields before calling the backend. Original file verification stays in the browser.

## Mainnet Anchor

```bash
cargo run -p zectime-cli -- timestamp anchor \
  --receipt zectime-zk-receipt.json \
  --network mainnet \
  --rpc-url "$ZECTIME_RPC_URL" \
  --from-address "$ZECTIME_FROM_ADDRESS" \
  --out timestamp-anchor.json
```

Fetch and verify the anchor:

```bash
cargo run -p zectime-cli -- timestamp fetch \
  --txid <64-hex-txid> \
  --network mainnet \
  --rpc-url "$ZECTIME_RPC_URL" \
  --receipt zectime-zk-receipt.json
```

## Tests

Rust:

```bash
cargo test --workspace
```

Web:

```bash
cd apps/web
npm test
npm run check
npm run build
```

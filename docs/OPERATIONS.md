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
ZECTIME_RPC_URL=http://127.0.0.1:28232/
ZECTIME_FROM_ADDRESS=<zallet-unified-address>
ZECTIME_RPC_USER=<optional-rpc-user>
ZECTIME_RPC_PASSWORD=<optional-rpc-password>
ZECTIME_WALLET_DB_PATH=<optional-zallet-wallet-db>
```

`ZECTIME_WALLET_DB_PATH` is only needed for the current zallet alpha fetch fallback when the app can read the local wallet database.

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

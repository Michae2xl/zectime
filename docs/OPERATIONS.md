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

# ZecTime

Private file fingerprint -> blind ZK commitment -> Zcash timestamp -> verifiable receipt.

ZecTime creates timestamp receipts for files without uploading the file and without publishing a reusable public file hash. The product commits to a locally computed SHA-256 fingerprint with a private nonce, anchors only the blinded commitment in a Zcash Orchard memo, and later verifies the receipt against chain data and an optional local re-hash of the original file.

## What It Is

ZecTime is a privacy-first timestamping layer for documents, media, evidence bundles, model outputs, contracts, datasets, and any artifact where the owner needs to prove existence at or before a Zcash block height.

It is not a storage network and it does not notarize file contents publicly. It proves that a private opening matches an on-chain commitment.

## What Works Today

- Live mainnet console: [zkglobalcredit.tech/timestamp](https://zkglobalcredit.tech/timestamp?lang=en).
- Browser-first console at `/timestamp` with two actions: Generate ZK Receipt and Verify ZK Receipt.
- Client-side SHA-256 hashing and blind Poseidon commitment generation.
- ZecTime receipt bundle download: `zectime-zk-receipt.json`.
- Zcash anchor path through zallet JSON-RPC.
- Verifier flow that accepts a bundle or a receipt, extracts txid when present, fetches the Orchard memo, checks chain data, and can re-hash the original file locally.
- Halo2 timestamp-open proof circuit.
- Halo2 timestamp-predicate proof circuit for selective claims over private document fields.
- Rust CLI, Rust crates, Next.js web app, and tests for the privacy-critical paths.

## Core Flow

1. The browser reads the file locally.
2. The browser computes SHA-256 locally.
3. The digest is split into two private 128-bit witnesses: `doc_hash_lo` and `doc_hash_hi`.
4. The browser generates a fresh 128-bit nonce.
5. The browser computes `commitment = Poseidon(domain_tag, doc_hash_lo, doc_hash_hi, nonce)`.
6. The server receives only the commitment for anchoring.
7. zallet publishes the commitment inside a Zcash Orchard memo.
8. ZecTime downloads a receipt bundle with txid, network, receipt, anchor metadata, and document size.
9. Verification fetches the anchor, compares commitment and block height, and optionally re-hashes the original file locally.

## Verify A Receipt

The normal verifier path is:

1. Open `/timestamp/verify`.
2. Load `zectime-zk-receipt.json` or paste its JSON content.
3. Optionally select the original file.
4. Click `Verify ZK receipt`.

If the bundle includes `txid`, the txid field can stay empty. The verifier extracts it from the JSON, fetches the Orchard memo, compares the commitment and block height, and re-hashes the original file locally when provided.

## Repository Layout

```text
apps/web              Next.js timestamp console and API bridge
crates/circuit        Halo2 timestamp and predicate circuits
crates/prover         Proof generation helpers
crates/verifier       Proof verification helpers
crates/anchor         Zcash memo layout and zallet RPC integration
crates/cli            zectime command-line interface
docs                  Architecture, privacy model, operations, roadmap
ops                   Mainnet operation helpers, including zallet RPC proxy
```

## Quick Start

Build the Rust workspace:

```bash
cargo build
```

Generate local Halo2 parameters:

```bash
cargo run -p zectime-cli -- setup --params tmp/timestamp-params.bin
```

Create a local receipt:

```bash
cargo run -p zectime-cli -- timestamp stamp \
  --file path/to/document.pdf \
  --out zectime-zk-receipt.json
```

Run the web console:

```bash
cd apps/web
npm install
npm run dev
```

Open `http://localhost:3000/timestamp`.

## Mainnet Configuration

The web app and CLI use zallet for Zcash anchoring.

```bash
ZECTIME_NETWORK=mainnet
ZECTIME_RPC_URL=http://127.0.0.1:28232/
ZECTIME_FROM_ADDRESS=<zallet-unified-address>
ZECTIME_RPC_USER=<optional-rpc-user>
ZECTIME_RPC_PASSWORD=<optional-rpc-password>
ZECTIME_PUBLIC_STAMP_DAILY_LIMIT=25
ZECTIME_PUBLIC_STAMP_IP_DAILY_LIMIT=3
```

For the Next.js app, copy `apps/web/.env.local.example` to `apps/web/.env.local`.

Public Generate is budgeted by default so the website cannot spend unlimited wallet funds. The retired `/api/timestamps/anchor` route no longer accepts private receipt data; use `/api/timestamps/stamp` with a client-generated blinded commitment.

## Privacy Position

ZecTime is stronger than plain hash timestamping because the public chain never receives the raw document hash. The public anchor is a blinded Poseidon commitment. A verifier only learns the opening when the owner chooses to share the receipt or original file.

See [docs/PRIVACY_MODEL.md](docs/PRIVACY_MODEL.md).

## Production Status

The core product is ready for technical review and pilot validation. It is not yet a fully audited commercial timestamping service. The main remaining production work is independent cryptographic review, hosted mainnet infrastructure, release packaging, monitoring, and durable key/wallet operations.

See [docs/ROADMAP.md](docs/ROADMAP.md).

## License

Licensed under either MIT or Apache-2.0.

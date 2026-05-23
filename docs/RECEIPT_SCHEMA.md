# Receipt Schema

The default generated file is:

```text
zectime-zk-receipt.json
```

## Receipt Fields

```json
{
  "commitment_scheme": "zectime-poseidon-pallas-v2",
  "commitment": "64 hex chars",
  "block_height": 0,
  "nonce": "32 hex chars",
  "doc_hash_lo": "32 hex chars",
  "doc_hash_hi": "32 hex chars",
  "doc_hash_sha256": "64 hex chars"
}
```

## Bundle Fields

The web console wraps the receipt with anchor metadata:

```json
{
  "schema": "zectime-zk-receipt.v2",
  "txid": "64 hex chars",
  "network": "mainnet",
  "publicReceipt": {
    "commitment_scheme": "zectime-poseidon-pallas-v2",
    "commitment": "64 hex chars",
    "block_height": 123456
  },
  "privateOpening": {
    "commitment_scheme": "zectime-poseidon-pallas-v2",
    "nonce": "32 hex chars",
    "doc_hash_lo": "32 hex chars",
    "doc_hash_hi": "32 hex chars",
    "doc_hash_sha256": "64 hex chars"
  },
  "anchor": {
    "txid": "64 hex chars",
    "network": "mainnet",
    "commitment": "64 hex chars",
    "blockHeight": 123456,
    "explorerUrl": "https://mainnet.zcashexplorer.app/transactions/..."
  },
  "document": {
    "size_bytes": 12345
  }
}
```

`block_height` is `0` before anchoring and is filled after the chain fetch confirms the tx height.

## Share Boundaries

- Share `zectime-public-receipt.json` when the verifier only needs to check that a commitment was anchored.
- Share `zectime-zk-receipt.json` or `zectime-private-opening.json` only when the verifier should be able to bind the anchor to the original file.
- The original file is never uploaded by the verifier UI; the browser re-hashes it locally.

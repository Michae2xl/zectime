# Privacy Model

ZecTime is designed to avoid the biggest privacy leak in classic timestamping: publishing a raw, reusable file hash.

## Threat Model

Classic timestamp services usually publish or commit to a document hash. If an attacker later obtains a candidate file, they can hash it and compare it with the public timestamp record.

ZecTime avoids that public correlation point by anchoring a blinded commitment instead of the raw SHA-256 digest.

## Commitment

The current commitment scheme is:

```text
commitment = Poseidon("ZecTime2", doc_hash_lo, doc_hash_hi, nonce)
```

Where:

- `doc_hash_lo` is the low 128 bits of the SHA-256 digest interpreted little-endian.
- `doc_hash_hi` is the high 128 bits of the SHA-256 digest interpreted little-endian.
- `nonce` is a fresh 128-bit random value.
- only `commitment` is anchored on Zcash.

The full SHA-256 digest remains private unless the receipt owner shares it.

## Data Visibility

| Data | Browser | ZecTime server | Zcash chain | Verifier |
| --- | --- | --- | --- | --- |
| Original file | yes | no | no | optional |
| SHA-256 digest | yes | no | no | optional |
| Nonce | yes | no | no | optional |
| Blind commitment | yes | yes | yes | yes |
| Txid and block height | yes | yes | yes | yes |

## Verification Modes

Public verification checks that the txid contains the same commitment and block height as the receipt.

Private verification additionally checks that the original file re-hashes locally to the private opening in the receipt.

ZK verification checks a Halo2 proof that the private opening matches the public commitment and block height without revealing the opening.

Predicate verification checks a selective claim over a private document structure without revealing the whole document.

## Limits

ZecTime does not hide the fact that a timestamp was created at a given Zcash transaction. It hides the document fingerprint behind a nonce-based commitment.

If the receipt owner publishes the private opening, that opening can be linked to the public commitment. This is intentional for verification.

The implementation still needs independent cryptographic review before being treated as a high-value production notarization system.

# Comparison

ZecTime competes with timestamping systems on privacy, not just anchoring.

| System | Public chain data | File hash privacy | Owner-controlled disclosure | ZK proof path |
| --- | --- | --- | --- | --- |
| Bitcoin-style timestamp | hash or Merkle commitment | partial | yes, depending on receipt | usually no |
| Decred dcrtime-style timestamp | Merkle root / anchored digest | partial | yes, depending on receipt | no |
| OpenTimestamps-style timestamp | calendar/Bitcoin commitment path | partial | yes, depending on receipt | no |
| ZecTime | blinded Poseidon commitment in Zcash memo | strong by default | yes | yes |
| Broad privacy-capsule proposal | unspecified Zcash memo or OP_RETURN commitment | depends on bundle design | yes | not specified |

## Difference

Classic timestamping proves that a digest existed before a chain event. That is useful, but a public digest can become a correlation handle if the original file or candidates leak later.

ZecTime adds a privacy layer before the chain:

```text
Private file fingerprint -> Blind ZK commitment -> Zcash timestamp -> Verifiable receipt
```

The public anchor does not reveal the SHA-256 digest. A verifier gets stronger evidence only when the owner shares the receipt opening, original file, or a ZK proof.

Compared with broad vault/capsule designs, ZecTime intentionally keeps the first product surface narrow: private proof-of-existence and verification. It does not bundle deadman switches, encrypted storage, or release automation into the timestamping primitive.

## Tradeoffs

ZecTime is more private than plain hash timestamping, but it has more moving parts:

- browser/client cryptography
- receipt custody
- zallet availability
- Halo2 parameters for proof flows
- Zcash RPC operations

This is the right tradeoff when file privacy matters more than the simplest possible public timestamp.

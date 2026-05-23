# Roadmap

## Current Readiness

ZecTime is strong enough for judges, demos, and technical pilot conversations.

It is not yet a fully market-grade public timestamping service. The privacy architecture is close to the target, but production trust depends on operations, audits, packaging, and reliability.

## Done

- Standalone ZecTime repo.
- Premium timestamp console with Generate and Verify flows.
- Client-side file hashing.
- Blind Poseidon commitment scheme.
- Zcash Orchard memo anchor path.
- zallet RPC integration.
- Receipt bundle download.
- Chain and receipt verification.
- Optional local file re-hash during verification.
- Timestamp-open Halo2 circuit.
- Timestamp-predicate Halo2 circuit.
- Rust and web test coverage for critical paths.

## Needed For Commercial 10/10

- Independent cryptographic review of the commitment and circuits.
- Security review of the web/API boundary.
- Hosted mainnet deployment with monitored zallet infrastructure.
- Public sample receipts and verifier examples.
- Reproducible release binaries for `zectime`.
- WASM prover/verifier path for fully local browser proof generation.
- Clear versioning and migration policy for receipt schemas.
- Operational runbooks for wallet backups, RPC auth, failures, and reorg handling.

## Product Direction

The wedge is private evidence timestamping:

- legal evidence bundles
- investigative media
- AI-generated outputs
- contracts before disclosure
- research datasets
- private compliance artifacts

The market story is simple: prove existence without turning the file hash into public metadata.

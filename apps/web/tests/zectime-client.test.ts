import { describe, expect, it } from "vitest";

import {
  PREDICATE_TREE_DEPTH,
  getZecTimeConfig,
  hashTimestampDocument,
  parsePredicatePublicInputsFromOutput,
  predicatePublicInputsMatchReceipt,
  parsePredicateWitness,
  parseTimestampReceipt,
  parseTimestampReceiptJson,
  parseTimestampPublicReceipt,
  resolveRuntimePath,
  verifyTimestampDocumentAgainstReceipt,
} from "../lib/server/zectime-client";

describe("zectime bridge helpers", () => {
  it("defaults the bridge network to regtest", () => {
    const originalCliBin = process.env.ZECTIME_CLI_BIN;
    const originalParamsPath = process.env.ZECTIME_PARAMS_PATH;
    const originalNetwork = process.env.ZECTIME_NETWORK;

    process.env.ZECTIME_CLI_BIN = "/tmp/zectime";
    process.env.ZECTIME_PARAMS_PATH = "params.bin";
    delete process.env.ZECTIME_NETWORK;

    try {
      expect(getZecTimeConfig().network).toBe("regtest");
    } finally {
      restoreEnv("ZECTIME_CLI_BIN", originalCliBin);
      restoreEnv("ZECTIME_PARAMS_PATH", originalParamsPath);
      restoreEnv("ZECTIME_NETWORK", originalNetwork);
    }
  });

  it("resolves relative runtime paths before command cwd changes", () => {
    expect(resolveRuntimePath("artifacts/params.bin", "/tmp/zectime-web")).toBe(
      "/tmp/zectime-web/artifacts/params.bin",
    );
    expect(resolveRuntimePath("/var/tmp/proof.bin", "/tmp/zectime-web")).toBe(
      "/var/tmp/proof.bin",
    );
  });

  it("parses a valid v2 timestamp receipt JSON and normalizes hex", () => {
    const raw = JSON.stringify({
      commitment_scheme: "zectime-poseidon-pallas-v2",
      commitment: "DEADBEEF".repeat(8),
      block_height: 1234,
      nonce: "AABBCCDDEEFF0011AABBCCDDEEFF0011",
      doc_hash_lo: "0123456789ABCDEF0123456789ABCDEF",
      doc_hash_hi: "FEDCBA9876543210FEDCBA9876543210",
      doc_hash_sha256: "AABBCCDDEEFF0011".repeat(4),
    });

    const receipt = parseTimestampReceiptJson(raw);
    expect(receipt.commitment_scheme).toBe("zectime-poseidon-pallas-v2");
    expect(receipt.commitment).toBe("deadbeef".repeat(8));
    expect(receipt.doc_hash_sha256).toBe("aabbccddeeff0011".repeat(4));
  });

  it("keeps legacy v1 timestamp receipts readable", () => {
    const receipt = parseTimestampReceipt({
      commitment: "DEADBEEF".repeat(8),
      block_height: 1234,
      nonce: "AABBCCDDEEFF0011",
      doc_hash_lo: "0123456789ABCDEF",
      doc_hash_hi: "FEDCBA9876543210",
      doc_hash_truncated: "AABBCCDDEEFF0011AABBCCDDEEFF0011",
    });

    expect(receipt.commitment_scheme).toBe("zectime-poseidon-pallas-v1");
    expect(receipt.doc_hash_truncated).toBe("aabbccddeeff0011aabbccddeeff0011");
  });

  it("parseTimestampPublicReceipt keeps only chain-verification fields", () => {
    const receipt = parseTimestampPublicReceipt({
      commitment: `0x${"DEADBEEF".repeat(8)}`,
      block_height: 1234,
      nonce: "AABBCCDDEEFF0011",
    });

    expect(receipt).toEqual({
      commitment: "deadbeef".repeat(8),
      block_height: 1234,
    });
  });

  it("hashes timestamp documents with the full SHA-256 little-endian layout", () => {
    const hash = hashTimestampDocument(Buffer.from("zec-time"));

    expect(hash.docHashSha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(hash.docHashLo).toHaveLength(32);
    expect(hash.docHashHi).toHaveLength(32);
    expect(hash.docHashLo).toBe(
      readBigUInt128LE(hash.docHashSha256.slice(0, 32)),
    );
    expect(hash.docHashHi).toBe(
      readBigUInt128LE(hash.docHashSha256.slice(32, 64)),
    );
  });

  it("verifies a document against the receipt hash fields", () => {
    const document = Buffer.from("zec-time");
    const hash = hashTimestampDocument(document);

    const verification = verifyTimestampDocumentAgainstReceipt(document, {
      commitment: "aa".repeat(32),
      block_height: 1234,
      nonce: "bb".repeat(16),
      doc_hash_lo: hash.docHashLo,
      doc_hash_hi: hash.docHashHi,
      doc_hash_sha256: hash.docHashSha256,
    });

    expect(verification.matchesReceipt).toBe(true);

    const mismatch = verifyTimestampDocumentAgainstReceipt(Buffer.from("bad"), {
      commitment: "aa".repeat(32),
      block_height: 1234,
      nonce: "bb".repeat(16),
      doc_hash_lo: hash.docHashLo,
      doc_hash_hi: hash.docHashHi,
      doc_hash_sha256: hash.docHashSha256,
    });
    expect(mismatch.matchesReceipt).toBe(false);
  });

  it("parses a valid predicate witness with all required fields", () => {
    const witness = parsePredicateWitness({
      doc_root: "0x" + "11".repeat(32),
      nonce: "0x" + "22".repeat(32),
      block_height: 2_500_000,
      field_index: 3,
      field_value: "0x" + "33".repeat(32),
      path_bits: Array.from(
        { length: PREDICATE_TREE_DEPTH },
        (_, i) => i % 2 === 0,
      ),
      siblings: Array.from(
        { length: PREDICATE_TREE_DEPTH },
        (_, i) => `0x${i.toString(16).padStart(64, "0")}`,
      ),
    });

    expect(witness.path_bits).toHaveLength(PREDICATE_TREE_DEPTH);
    expect(witness.siblings).toHaveLength(PREDICATE_TREE_DEPTH);
  });

  it("extracts predicate public inputs from CLI output", () => {
    const parsed = parsePredicatePublicInputsFromOutput(`
  [0] commitment = 0x00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff
  [1] block_height = 0x000000000000000000000000000000000000000000000000000000000026257f
  [2] claim_hash = 0xaabbccddeeff00112233445566778899aabbccddeeff00112233445566778899
OK: predicate proof verified
`);

    expect(parsed.commitment).toBe(
      "ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100",
    );
    expect(parsed.blockHeight).toBe(0x26257f);
    expect(parsed.claimHash).toBe(
      "99887766554433221100ffeeddccbbaa99887766554433221100ffeeddccbbaa",
    );
  });

  it("requires predicate proof block height to match the receipt", () => {
    const receipt = {
      commitment: "11".repeat(32),
      block_height: 100,
      nonce: "22".repeat(16),
      doc_hash_lo: "33".repeat(16),
      doc_hash_hi: "44".repeat(16),
      doc_hash_sha256: "55".repeat(32),
    };

    expect(
      predicatePublicInputsMatchReceipt(
        {
          commitment: "11".repeat(32),
          blockHeight: 100,
          claimHash: "66".repeat(32),
        },
        receipt,
      ),
    ).toBe(true);
    expect(
      predicatePublicInputsMatchReceipt(
        {
          commitment: "11".repeat(32),
          blockHeight: 101,
          claimHash: "66".repeat(32),
        },
        receipt,
      ),
    ).toBe(false);
  });
});

function readBigUInt128LE(hexValue: string): string {
  const bytes = Buffer.from(hexValue, "hex");
  let value = 0n;
  for (let index = bytes.length - 1; index >= 0; index -= 1) {
    value = (value << 8n) + BigInt(bytes[index]);
  }
  return value.toString(16).padStart(32, "0");
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

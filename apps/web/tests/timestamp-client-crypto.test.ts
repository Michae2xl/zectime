import { describe, expect, it } from "vitest";

import {
  buildClientTimestampPrivateOpening,
  buildClientTimestampPublicReceipt,
  createClientTimestampDraft,
  poseidonPallasCommitment,
  verifyClientTimestampDocument,
} from "../lib/timestamp-client-crypto";

describe("timestamp client crypto", () => {
  it("matches the Rust Halo2 Poseidon commitment vector", () => {
    const commitment = poseidonPallasCommitment(
      0x0123_4567_89ab_cdef_0011_2233_4455_6677n,
      0xfedc_ba98_7654_3210_7766_5544_3322_1100n,
      0xdead_beef_cafe_f00d_0102_0304_0506_0708n,
    );

    expect(commitment).toBe(
      "e2e0bd215ac3d75a6af5905cd12e474da7b604dc307c8d2ac6fec60da68a5e0b",
    );
  });

  it("verifies the original file locally from the private opening", async () => {
    const file = new File(["zec-time private receipt"], "doc.txt");
    const draft = await createClientTimestampDraft(file);
    const publicReceipt = buildClientTimestampPublicReceipt(draft.receipt);
    const privateOpening = buildClientTimestampPrivateOpening(
      draft.receipt,
      draft.documentSizeBytes,
    );

    expect(draft.receipt.commitment_scheme).toBe(
      "zectime-poseidon-pallas-v2",
    );
    expect(privateOpening.nonce).toMatch(/^[0-9a-f]{32}$/u);
    expect(privateOpening.doc_hash_lo).toMatch(/^[0-9a-f]{32}$/u);
    expect(privateOpening.doc_hash_hi).toMatch(/^[0-9a-f]{32}$/u);
    expect(privateOpening.doc_hash_sha256).toMatch(/^[0-9a-f]{64}$/u);

    const valid = await verifyClientTimestampDocument(
      file,
      publicReceipt,
      privateOpening,
    );
    const tampered = await verifyClientTimestampDocument(
      new File(["tampered"], "doc.txt"),
      publicReceipt,
      privateOpening,
    );

    expect(valid.matchesReceipt).toBe(true);
    expect(valid.commitmentMatchesReceipt).toBe(true);
    expect(tampered.matchesReceipt).toBe(false);
    expect(tampered.openingMatchesFile).toBe(false);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/server/zectime-client", () => {
  return {
    createTimestampReceipt: vi.fn(),
    stampAndAnchorTimestampDocument: vi.fn(),
    fetchTimestampAnchor: vi.fn(),
    parseTimestampPublicReceipt: vi.fn(),
    parseTimestampReceipt: vi.fn(),
    parseTimestampReceiptJson: vi.fn(),
    verifyTimestampDocumentAgainstReceipt: vi.fn(),
    anchorTimestampCommitment: vi.fn(),
    anchorTimestampReceipt: vi.fn(),
    createPredicateProof: vi.fn(),
  };
});

import * as zectimeClient from "../lib/server/zectime-client";
import { POST as stampRoute } from "../app/api/timestamps/stamp/route";
import { POST as fetchRoute } from "../app/api/timestamps/fetch/route";
import { POST as anchorRoute } from "../app/api/timestamps/anchor/route";
import { POST as predicateProveRoute } from "../app/api/timestamps/predicate/prove/route";

const mockedClient = vi.mocked(zectimeClient);

type ErrorEnvelope = { error: { kind: string; message: string } };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("/api/timestamps/stamp", () => {
  it("rejects requests without a commitment", async () => {
    const response = await stampRoute(
      new Request("http://localhost/api/timestamps/stamp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as ErrorEnvelope;
    expect(body.error.kind).toBe("validation");
    expect(body.error.message).toMatch(/missing required field: commitment/i);
  });

  it("rejects malformed commitments", async () => {
    const response = await stampRoute(
      new Request("http://localhost/api/timestamps/stamp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commitment: "not-hex" }),
      }),
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as ErrorEnvelope;
    expect(body.error.kind).toBe("validation");
    expect(body.error.message).toMatch(/32-byte hex/i);
  });

  it("anchors a client-side commitment without receiving the file or receipt", async () => {
    mockedClient.anchorTimestampCommitment.mockResolvedValueOnce({
      anchor: {
        txid: "ab".repeat(32),
        network: "mainnet",
        commitment: "aa".repeat(32),
        blockHeight: 42,
        explorerUrl: "https://mainnet.zcashexplorer.app/transactions/ab",
      },
    });

    const response = await stampRoute(
      new Request("http://localhost/api/timestamps/stamp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commitment: "aa".repeat(32) }),
      }),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      anchor: { network: string; blockHeight: number | null };
    };
    expect(body.anchor.network).toBe("mainnet");
    expect(body.anchor.blockHeight).toBe(42);
    expect(mockedClient.anchorTimestampCommitment).toHaveBeenCalledWith(
      "aa".repeat(32),
    );
  });
});

describe("/api/timestamps/fetch", () => {
  it("rejects malformed txids", async () => {
    const response = await fetchRoute(
      new Request("http://localhost/api/timestamps/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txid: "not-hex" }),
      }),
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as ErrorEnvelope;
    expect(body.error.kind).toBe("validation");
    expect(body.error.message).toMatch(/missing or invalid txid/i);
  });

  it("forwards the normalized txid and returns the artifact", async () => {
    mockedClient.fetchTimestampAnchor.mockResolvedValueOnce({
      txid: "ab".repeat(32),
      network: "regtest",
      blockHeight: 99,
      commitment: "cd".repeat(32),
      matchesReceipt: null,
    });

    const response = await fetchRoute(
      new Request("http://localhost/api/timestamps/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txid: `0x${"AB".repeat(32)}` }),
      }),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      artifact: { txid: string; blockHeight: number };
    };
    expect(body.artifact.blockHeight).toBe(99);
    expect(mockedClient.fetchTimestampAnchor).toHaveBeenCalledWith(
      "ab".repeat(32),
      expect.objectContaining({ receipt: undefined }),
    );
  });

  it("rejects invalid receipt JSON as validation, not a server error", async () => {
    const response = await fetchRoute(
      new Request("http://localhost/api/timestamps/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          txid: "ff".repeat(32),
          receiptJson: "{bad json",
        }),
      }),
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as ErrorEnvelope;
    expect(body.error.kind).toBe("validation");
    expect(body.error.message).toMatch(/invalid receipt json/i);
  });

  it("uses only the public receipt when receiptJson is provided", async () => {
    mockedClient.fetchTimestampAnchor.mockResolvedValueOnce({
      txid: "ff".repeat(32),
      network: "regtest",
      blockHeight: 7,
      commitment: "aa".repeat(32),
      matchesReceipt: true,
    });

    const publicReceipt = {
      commitment: "aa".repeat(32),
      block_height: 7,
    };
    mockedClient.parseTimestampPublicReceipt.mockReturnValueOnce(publicReceipt);

    const response = await fetchRoute(
      new Request("http://localhost/api/timestamps/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          txid: "ff".repeat(32),
          receiptJson: JSON.stringify({
            schema: "zectime.public-receipt.v2",
            publicReceipt,
            privateOpening: {
              commitment_scheme: "zectime-poseidon-pallas-v2",
              nonce: "bb".repeat(16),
              doc_hash_lo: "cc".repeat(16),
              doc_hash_hi: "dd".repeat(16),
              doc_hash_sha256: "ee".repeat(32),
            },
          }),
        }),
      }),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { documentVerification: null };
    expect(body.documentVerification).toBeNull();
    expect(mockedClient.parseTimestampPublicReceipt).toHaveBeenCalledWith(
      publicReceipt,
    );
    expect(mockedClient.fetchTimestampAnchor).toHaveBeenCalledWith(
      "ff".repeat(32),
      expect.objectContaining({ receipt: publicReceipt }),
    );
    expect(mockedClient.verifyTimestampDocumentAgainstReceipt).not.toHaveBeenCalled();
  });

  it("extracts txid from a public receipt bundle", async () => {
    mockedClient.fetchTimestampAnchor.mockResolvedValueOnce({
      txid: "ef".repeat(32),
      network: "regtest",
      blockHeight: 44,
      commitment: "aa".repeat(32),
      matchesReceipt: true,
    });

    const publicReceipt = {
      commitment: "aa".repeat(32),
      block_height: 44,
    };
    mockedClient.parseTimestampPublicReceipt.mockReturnValueOnce(publicReceipt);

    const response = await fetchRoute(
      new Request("http://localhost/api/timestamps/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receiptJson: JSON.stringify({
            schema: "zectime.public-receipt.v2",
            txid: "ef".repeat(32),
            publicReceipt,
          }),
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockedClient.fetchTimestampAnchor).toHaveBeenCalledWith(
      "ef".repeat(32),
      expect.objectContaining({ receipt: publicReceipt }),
    );
  });

  it("rejects multipart verification uploads so files never reach the backend", async () => {
    const formData = new FormData();
    formData.append("txid", "ef".repeat(32));
    formData.append("file", new File([new Uint8Array([1, 2, 3])], "doc.bin"));

    const response = await fetchRoute(
      new Request("http://localhost/api/timestamps/fetch", {
        method: "POST",
        body: formData,
      }),
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as ErrorEnvelope;
    expect(body.error.kind).toBe("validation");
    expect(body.error.message).toMatch(/expected json body/i);
    expect(mockedClient.fetchTimestampAnchor).not.toHaveBeenCalled();
  });
});

describe("/api/timestamps/anchor", () => {
  it("rejects requests without a receipt payload", async () => {
    const response = await anchorRoute(
      new Request("http://localhost/api/timestamps/anchor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as ErrorEnvelope;
    expect(body.error.kind).toBe("validation");
    expect(body.error.message).toMatch(/receipt or receiptjson/i);
  });

  it("broadcasts the receipt and returns the anchor artifact with explorer url", async () => {
    const receipt = {
      commitment_scheme: "zectime-poseidon-pallas-v2",
      commitment: "aa".repeat(32),
      block_height: 42,
      nonce: "bb".repeat(16),
      doc_hash_lo: "cc".repeat(16),
      doc_hash_hi: "dd".repeat(16),
      doc_hash_sha256: "ee".repeat(32),
    };
    mockedClient.parseTimestampReceipt.mockReturnValueOnce(receipt);
    mockedClient.anchorTimestampReceipt.mockResolvedValueOnce({
      txid: "ab".repeat(32),
      network: "regtest",
      commitment: "aa".repeat(32),
      blockHeight: null,
      explorerUrl: null,
    });

    const response = await anchorRoute(
      new Request("http://localhost/api/timestamps/anchor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receipt }),
      }),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      artifact: {
        txid: string;
        network: string;
        commitment: string;
        explorerUrl: string | null;
      };
    };
    expect(body.artifact.txid).toBe("ab".repeat(32));
    expect(body.artifact.network).toBe("regtest");
    expect(body.artifact.explorerUrl).toBeNull();
    expect(mockedClient.anchorTimestampReceipt).toHaveBeenCalledWith(receipt);
  });

  it("returns an explorer url for mainnet anchors", async () => {
    const receipt = {
      commitment_scheme: "zectime-poseidon-pallas-v2",
      commitment: "aa".repeat(32),
      block_height: 42,
      nonce: "bb".repeat(16),
      doc_hash_lo: "cc".repeat(16),
      doc_hash_hi: "dd".repeat(16),
      doc_hash_sha256: "ee".repeat(32),
    };
    mockedClient.parseTimestampReceipt.mockReturnValueOnce(receipt);
    mockedClient.anchorTimestampReceipt.mockResolvedValueOnce({
      txid: "ab".repeat(32),
      network: "mainnet",
      commitment: "aa".repeat(32),
      blockHeight: null,
      explorerUrl: `https://mainnet.zcashexplorer.app/transactions/${"ab".repeat(32)}`,
    });

    const response = await anchorRoute(
      new Request("http://localhost/api/timestamps/anchor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receipt }),
      }),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      artifact: { explorerUrl: string };
    };
    expect(body.artifact.explorerUrl).toBe(
      `https://mainnet.zcashexplorer.app/transactions/${"ab".repeat(32)}`,
    );
  });

  it("sanitizes helper errors into a generic 500", async () => {
    const receipt = {
      commitment_scheme: "zectime-poseidon-pallas-v2",
      commitment: "aa".repeat(32),
      block_height: 42,
      nonce: "bb".repeat(16),
      doc_hash_lo: "cc".repeat(16),
      doc_hash_hi: "dd".repeat(16),
      doc_hash_sha256: "ee".repeat(32),
    };
    mockedClient.parseTimestampReceipt.mockReturnValueOnce(receipt);
    mockedClient.anchorTimestampReceipt.mockRejectedValueOnce(
      new Error("zallet offline /private/paths/leaked"),
    );

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await anchorRoute(
      new Request("http://localhost/api/timestamps/anchor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receipt }),
      }),
    );

    expect(response.status).toBe(500);
    const body = (await response.json()) as ErrorEnvelope;
    expect(body.error.kind).toBe("unknown");
    expect(body.error.message).toBe("Internal server error");
    expect(body.error.message).not.toMatch(/zallet/i);
    expect(body.error.message).not.toMatch(/private/i);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

describe("/api/timestamps/predicate/prove", () => {
  it("rejects witness uploads because predicate proving is local-only", async () => {
    const response = await predicateProveRoute(
      new Request("http://localhost/api/timestamps/predicate/prove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ witness: { doc_root: "secret" } }),
      }),
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as ErrorEnvelope;
    expect(body.error.kind).toBe("validation");
    expect(body.error.message).toMatch(/local-only/i);
    expect(mockedClient.createPredicateProof).not.toHaveBeenCalled();
  });
});

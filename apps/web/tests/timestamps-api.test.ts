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
  process.env.ZECTIME_PUBLIC_STAMP_BUDGET_PATH =
    `/tmp/zectime-test-budget-${process.pid}-${Date.now()}-${Math.random()}.json`;
  process.env.ZECTIME_PUBLIC_STAMP_DAILY_LIMIT = "25";
  process.env.ZECTIME_PUBLIC_STAMP_IP_DAILY_LIMIT = "3";
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

  it("enforces the public stamp budget before spending wallet funds", async () => {
    process.env.ZECTIME_PUBLIC_STAMP_IP_DAILY_LIMIT = "1";
    mockedClient.anchorTimestampCommitment.mockResolvedValueOnce({
      anchor: {
        txid: "ab".repeat(32),
        network: "mainnet",
        commitment: "aa".repeat(32),
        blockHeight: 42,
        explorerUrl: "https://mainnet.zcashexplorer.app/transactions/ab",
      },
    });

    const first = await stampRoute(
      new Request("http://localhost/api/timestamps/stamp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commitment: "aa".repeat(32) }),
      }),
    );
    const second = await stampRoute(
      new Request("http://localhost/api/timestamps/stamp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commitment: "bb".repeat(32) }),
      }),
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(mockedClient.anchorTimestampCommitment).toHaveBeenCalledTimes(1);
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
  it("is retired so private receipt openings are not accepted by the backend", async () => {
    const response = await anchorRoute(
      new Request("http://localhost/api/timestamps/anchor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receipt: {
            commitment_scheme: "zectime-poseidon-pallas-v2",
            commitment: "aa".repeat(32),
            block_height: 42,
            nonce: "bb".repeat(16),
            doc_hash_lo: "cc".repeat(16),
            doc_hash_hi: "dd".repeat(16),
            doc_hash_sha256: "ee".repeat(32),
          },
        }),
      }),
    );

    expect(response.status).toBe(410);
    const body = (await response.json()) as ErrorEnvelope;
    expect(body.error.kind).toBe("validation");
    expect(body.error.message).toMatch(/no longer accepts private receipt/i);
    expect(mockedClient.parseTimestampReceipt).not.toHaveBeenCalled();
    expect(mockedClient.anchorTimestampReceipt).not.toHaveBeenCalled();
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

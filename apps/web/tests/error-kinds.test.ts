import { describe, expect, it, vi } from "vitest";

import {
  classifyError,
  createServerErrorResponse,
  ServerError,
  statusForKind,
} from "../lib/server/error-kinds";

describe("error-kinds classifier", () => {
  it("maps missing proof messages to missing_proof", () => {
    const payload = classifyError(
      new Error("Verifier flow does not have a proof to verify"),
      "proofs/verify",
    );
    expect(payload.kind).toBe("missing_proof");
  });

  it("maps missing anchor messages to missing_anchor", () => {
    const payload = classifyError(
      new Error("Verifier flow does not have an anchor transaction to fetch"),
      "anchors/fetch",
    );
    expect(payload.kind).toBe("missing_anchor");
  });

  it("maps bundle gaps to missing_bundle", () => {
    const payload = classifyError(
      new Error("Verifier flow does not have a prepared bundle"),
      "proofs/verify",
    );
    expect(payload.kind).toBe("missing_bundle");
  });

  it("maps mismatch messages to proof_mismatch", () => {
    const payload = classifyError(
      new Error(
        "Verified public inputs do not match the runtime proof artifact",
      ),
      "proofs/verify",
    );
    expect(payload.kind).toBe("proof_mismatch");
  });

  it("maps validation messages to validation", () => {
    const payload = classifyError(
      new Error("Issuer name is required"),
      "issuer/provision",
    );
    expect(payload.kind).toBe("validation");
  });

  it("maps CLI env errors to cli_unavailable", () => {
    const payload = classifyError(
      new Error("Missing required environment variable: ZECTIME_CLI_BIN"),
      "proofs/create",
    );
    expect(payload.kind).toBe("cli_unavailable");
  });

  it("maps missing anchor RPC configuration to cli_unavailable", () => {
    const payload = classifyError(
      new Error(
        "Missing anchor configuration: rpcUrl and fromAddress are required",
      ),
      "anchors/create",
    );
    expect(payload.kind).toBe("cli_unavailable");
  });

  it("maps network refusal to network_unsupported", () => {
    const payload = classifyError(
      new Error(
        "Anchor network mainnet is not accepted by verifier bundle verifier_lisbon",
      ),
      "anchors/create",
    );
    expect(payload.kind).toBe("network_unsupported");
  });

  it("maps flow guard errors to flow_conflict", () => {
    const payload = classifyError(
      new Error("Holder proof can only be created once from a prepared flow"),
      "proofs/create",
    );
    expect(payload.kind).toBe("flow_conflict");
  });

  it("falls back to unknown for truly unexpected errors", () => {
    const payload = classifyError(
      new Error("Something exotic happened"),
      "proofs/verify",
    );
    expect(payload.kind).toBe("unknown");
    expect(payload.message).toBe("Internal server error");
  });

  it("preserves ServerError instances without reclassification", () => {
    const original = new ServerError("nullifier_replay", "Replay detected", {
      nullifierHex: "abc",
    });
    const payload = classifyError(original, "proofs/verify");
    expect(payload.kind).toBe("nullifier_replay");
    expect(payload.details).toEqual({ nullifierHex: "abc" });
  });

  it("uses expected status codes for common error kinds", () => {
    expect(statusForKind("validation")).toBe(400);
    expect(statusForKind("missing_proof")).toBe(409);
    expect(statusForKind("rate_limit")).toBe(429);
    expect(statusForKind("unknown")).toBe(500);
  });

  it("creates a JSON response with the classified envelope", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = createServerErrorResponse(
        "proofs/verify",
        new Error("Verifier flow does not have a proof to verify"),
      );
      const body = (await response.json()) as {
        error: { kind: string; message: string };
      };

      expect(response.status).toBe(409);
      expect(body.error.kind).toBe("missing_proof");
      expect(body.error.message).toMatch(/proof to verify/iu);
    } finally {
      consoleSpy.mockRestore();
    }
  });
});

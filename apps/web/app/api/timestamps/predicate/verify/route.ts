import { NextResponse } from "next/server";

import {
  createServerErrorResponse,
  type ServerErrorEnvelope,
} from "../../../../../lib/server/error-kinds";
import { enforceRateLimit } from "../../../../../lib/server/rate-limit";
import { readLimitedJsonObject } from "../../../../../lib/server/request-body";
import {
  parseTimestampReceipt,
  parseTimestampReceiptJson,
  verifyPredicateProof,
  type TimestampReceipt,
} from "../../../../../lib/server/zectime-client";

const RATE_LIMIT = { maxRequests: 20, windowMs: 60_000 };
const MAX_BODY_BYTES = 4 * 1024 * 1024;
const MAX_PROOF_BASE64_CHARS = 3 * 1024 * 1024;

interface PredicateVerifyRequestBody {
  proofBase64?: unknown;
  receipt?: unknown;
  receiptJson?: unknown;
}

function validationResponse(message: string): NextResponse {
  return NextResponse.json<ServerErrorEnvelope>(
    { error: { kind: "validation", message } },
    { status: 400 },
  );
}

export async function POST(request: Request) {
  const throttled = enforceRateLimit(
    request,
    "timestamps/predicate/verify",
    RATE_LIMIT,
  );
  if (throttled) return throttled;

  try {
    const payload = (await readLimitedJsonObject(
      request,
      MAX_BODY_BYTES,
    )) as PredicateVerifyRequestBody;

    if (typeof payload.proofBase64 !== "string" || !payload.proofBase64) {
      return validationResponse("Missing required field: proofBase64");
    }
    const proofBase64 = normalizeProofBase64(payload.proofBase64);
    if (!proofBase64) {
      return validationResponse("Invalid proofBase64");
    }

    let receipt: TimestampReceipt | undefined;
    try {
      receipt = extractReceipt(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return validationResponse(message);
    }

    const result = await verifyPredicateProof(proofBase64, { receipt });

    return NextResponse.json({
      verification: {
        publicInputs: result.publicInputs,
        matchesReceipt: result.matchesReceipt,
      },
    });
  } catch (error) {
    return createServerErrorResponse("timestamps/predicate/verify", error);
  }
}

function extractReceipt(
  payload: PredicateVerifyRequestBody,
): TimestampReceipt | undefined {
  if (typeof payload.receiptJson === "string" && payload.receiptJson.trim()) {
    return parseTimestampReceiptJson(payload.receiptJson);
  }

  if (payload.receipt && typeof payload.receipt === "object") {
    return parseTimestampReceipt(payload.receipt);
  }

  return undefined;
}

function normalizeProofBase64(raw: string): string | null {
  const normalized = raw.replace(/\s+/gu, "");
  if (!normalized || normalized.length > MAX_PROOF_BASE64_CHARS) {
    return null;
  }
  if (normalized.length % 4 !== 0) {
    return null;
  }
  return /^[A-Za-z0-9+/]+={0,2}$/u.test(normalized) ? normalized : null;
}

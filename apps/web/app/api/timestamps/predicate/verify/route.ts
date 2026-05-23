import { NextResponse } from "next/server";

import {
  createServerErrorResponse,
  type ServerErrorEnvelope,
} from "../../../../../lib/server/error-kinds";
import { enforceRateLimit } from "../../../../../lib/server/rate-limit";
import {
  parseTimestampReceipt,
  parseTimestampReceiptJson,
  verifyPredicateProof,
  type TimestampReceipt,
} from "../../../../../lib/server/zectime-client";

const RATE_LIMIT = { maxRequests: 20, windowMs: 60_000 };

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
    const payload = (await readRequestJson(
      request,
    )) as PredicateVerifyRequestBody;

    if (typeof payload.proofBase64 !== "string" || !payload.proofBase64) {
      return validationResponse("Missing required field: proofBase64");
    }

    let receipt: TimestampReceipt | undefined;
    try {
      receipt = extractReceipt(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return validationResponse(message);
    }

    const result = await verifyPredicateProof(payload.proofBase64, { receipt });

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

async function readRequestJson(
  request: Request,
): Promise<Record<string, unknown>> {
  const raw = await request.text();
  if (!raw) {
    return {};
  }
  return JSON.parse(raw) as Record<string, unknown>;
}

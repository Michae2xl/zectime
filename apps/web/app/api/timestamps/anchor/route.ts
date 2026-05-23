import { NextResponse } from "next/server";

import {
  createServerErrorResponse,
  type ServerErrorEnvelope,
} from "../../../../lib/server/error-kinds";
import { enforceRateLimit } from "../../../../lib/server/rate-limit";
import {
  anchorTimestampReceipt,
  parseTimestampReceipt,
  parseTimestampReceiptJson,
  type TimestampReceipt,
} from "../../../../lib/server/zectime-client";

const RATE_LIMIT = { maxRequests: 10, windowMs: 60_000 };

interface AnchorRequestBody {
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
  const throttled = enforceRateLimit(request, "timestamps/anchor", RATE_LIMIT);
  if (throttled) return throttled;

  let payload: AnchorRequestBody;
  try {
    payload = (await readRequestJson(request)) as AnchorRequestBody;
  } catch {
    return validationResponse("Request body must be valid JSON");
  }

  let receipt: TimestampReceipt;
  try {
    receipt = extractReceipt(payload);
  } catch (error) {
    return validationResponse(getErrorMessage(error));
  }

  try {
    const artifact = await anchorTimestampReceipt(receipt);
    return NextResponse.json({ artifact });
  } catch (error) {
    return createServerErrorResponse("timestamps/anchor", error);
  }
}

function extractReceipt(payload: AnchorRequestBody): TimestampReceipt {
  if (typeof payload.receiptJson === "string" && payload.receiptJson.trim()) {
    return parseTimestampReceiptJson(payload.receiptJson);
  }

  if (payload.receipt && typeof payload.receipt === "object") {
    return parseTimestampReceipt(payload.receipt);
  }

  throw new Error("Missing required field: receipt or receiptJson");
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

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Unexpected timestamp anchor error";
}

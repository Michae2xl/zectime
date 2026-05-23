import { NextResponse } from "next/server";

import {
  createServerErrorResponse,
  type ServerErrorEnvelope,
} from "../../../../../lib/server/error-kinds";
import { enforceRateLimit } from "../../../../../lib/server/rate-limit";
const RATE_LIMIT = { maxRequests: 5, windowMs: 60_000 };

function validationResponse(message: string): NextResponse {
  return NextResponse.json<ServerErrorEnvelope>(
    { error: { kind: "validation", message } },
    { status: 400 },
  );
}

export async function POST(request: Request) {
  const throttled = enforceRateLimit(
    request,
    "timestamps/predicate/prove",
    RATE_LIMIT,
  );
  if (throttled) return throttled;

  try {
    await readRequestJson(request);
    return validationResponse(
      "Predicate proving is local-only for privacy. Use the zectime CLI or a WASM client; this API never accepts witness JSON.",
    );
  } catch (error) {
    return createServerErrorResponse("timestamps/predicate/prove", error);
  }
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

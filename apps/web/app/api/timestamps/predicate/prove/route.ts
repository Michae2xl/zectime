import { NextResponse } from "next/server";

import {
  createServerErrorResponse,
  type ServerErrorEnvelope,
} from "../../../../../lib/server/error-kinds";
import { enforceRateLimit } from "../../../../../lib/server/rate-limit";
import { readLimitedJsonObject } from "../../../../../lib/server/request-body";
const RATE_LIMIT = { maxRequests: 5, windowMs: 60_000 };
const MAX_BODY_BYTES = 16 * 1024;

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
    await readLimitedJsonObject(request, MAX_BODY_BYTES);
    return validationResponse(
      "Predicate proving is local-only for privacy. Use the zectime CLI or a WASM client; this API never accepts witness JSON.",
    );
  } catch (error) {
    return createServerErrorResponse("timestamps/predicate/prove", error);
  }
}

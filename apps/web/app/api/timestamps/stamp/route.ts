import { NextResponse } from "next/server";

import {
  createServerErrorResponse,
  type ServerErrorEnvelope,
} from "../../../../lib/server/error-kinds";
import { enforceRateLimit } from "../../../../lib/server/rate-limit";
import { anchorTimestampCommitment } from "../../../../lib/server/zectime-client";

const RATE_LIMIT = { maxRequests: 10, windowMs: 60_000 };

function validationResponse(message: string, status = 400): NextResponse {
  return NextResponse.json<ServerErrorEnvelope>(
    { error: { kind: "validation", message } },
    { status },
  );
}

export async function POST(request: Request) {
  const throttled = enforceRateLimit(request, "timestamps/stamp", RATE_LIMIT);
  if (throttled) return throttled;

  try {
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return validationResponse("Expected JSON body");
    }

    if (typeof payload !== "object" || payload === null) {
      return validationResponse("Expected JSON object");
    }

    const commitment = (payload as { commitment?: unknown }).commitment;
    if (typeof commitment !== "string") {
      return validationResponse("Missing required field: commitment");
    }

    const normalizedCommitment = commitment.trim().replace(/^0x/iu, "");
    if (!/^[0-9a-fA-F]{64}$/u.test(normalizedCommitment)) {
      return validationResponse("Commitment must be 32-byte hex");
    }

    const artifact = await anchorTimestampCommitment(normalizedCommitment);

    return NextResponse.json({
      anchor: artifact.anchor,
    });
  } catch (error) {
    return createServerErrorResponse("timestamps/stamp", error);
  }
}

import { NextResponse } from "next/server";

import {
  type ServerErrorEnvelope,
} from "../../../../lib/server/error-kinds";
import { enforceRateLimit } from "../../../../lib/server/rate-limit";

const RATE_LIMIT = { maxRequests: 10, windowMs: 60_000 };

export async function POST(request: Request) {
  const throttled = enforceRateLimit(request, "timestamps/anchor", RATE_LIMIT);
  if (throttled) return throttled;

  return NextResponse.json<ServerErrorEnvelope>(
    {
      error: {
        kind: "validation",
        message:
          "This endpoint no longer accepts private receipt data. Use /api/timestamps/stamp with a client-side commitment.",
      },
    },
    { status: 410 },
  );
}

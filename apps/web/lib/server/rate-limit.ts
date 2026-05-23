import { NextResponse } from "next/server";

import { getClientIp } from "./client-ip";
import type { ServerErrorEnvelope } from "./error-kinds";

interface RateLimitOptions {
  maxRequests: number;
  windowMs: number;
}

const buckets = new Map<string, { count: number; resetAt: number }>();

export function enforceRateLimit(
  request: Request,
  scope: string,
  options: RateLimitOptions,
): NextResponse<ServerErrorEnvelope> | null {
  const ip = getClientIp(request);
  const key = `${scope}:${ip}`;
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + options.windowMs });
    return null;
  }
  bucket.count += 1;
  if (bucket.count <= options.maxRequests) {
    return null;
  }
  return NextResponse.json(
    { error: { kind: "rate_limit", message: "Too many requests" } },
    { status: 429 },
  );
}

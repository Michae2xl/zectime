import { NextResponse } from "next/server";

import {
  createServerErrorResponse,
  type ServerErrorEnvelope,
} from "../../../../lib/server/error-kinds";
import { enforceRateLimit } from "../../../../lib/server/rate-limit";
import { readLimitedJsonObject } from "../../../../lib/server/request-body";
import {
  fetchTimestampAnchor,
  parseTimestampPublicReceipt,
  type TimestampPublicReceipt,
} from "../../../../lib/server/zectime-client";

const RATE_LIMIT = { maxRequests: 30, windowMs: 60_000 };
const MAX_BODY_BYTES = 64 * 1024;

interface FetchRequestBody {
  txid?: unknown;
  receipt?: unknown;
  receiptJson?: unknown;
}

function validationResponse(message: string, status = 400): NextResponse {
  return NextResponse.json<ServerErrorEnvelope>(
    { error: { kind: "validation", message } },
    { status },
  );
}

export async function POST(request: Request) {
  const throttled = enforceRateLimit(request, "timestamps/fetch", RATE_LIMIT);
  if (throttled) return throttled;

  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      return validationResponse("Expected JSON body");
    }

    const payload = await readFetchRequest(request);
    let receiptEnvelope: {
      receipt?: TimestampPublicReceipt;
      txid?: unknown;
    };
    try {
      receiptEnvelope = extractReceiptEnvelope(payload);
    } catch {
      return validationResponse("Invalid receipt JSON");
    }
    const txid = normalizeTxid(payload.txid) ?? normalizeTxid(receiptEnvelope.txid);

    if (!txid) {
      return validationResponse(
        "Missing or invalid txid: expected 64 hex chars",
      );
    }

    const artifact = await fetchTimestampAnchor(txid, {
      receipt: receiptEnvelope.receipt,
    });

    return NextResponse.json({ artifact, documentVerification: null });
  } catch (error) {
    return createServerErrorResponse("timestamps/fetch", error);
  }
}

function extractReceiptEnvelope(payload: FetchRequestBody): {
  receipt?: TimestampPublicReceipt;
  txid?: unknown;
} {
  if (typeof payload.receiptJson === "string" && payload.receiptJson.trim()) {
    const parsed = JSON.parse(payload.receiptJson) as unknown;
    return parseReceiptEnvelope(parsed);
  }

  if (payload.receipt && typeof payload.receipt === "object") {
    return parseReceiptEnvelope(payload.receipt);
  }

  return {};
}

function parseReceiptEnvelope(value: unknown): {
  receipt?: TimestampPublicReceipt;
  txid?: unknown;
} {
  const envelope = typeof value === "object" && value !== null ? value : null;
  if (!envelope) {
    return { receipt: parseTimestampPublicReceipt(value) };
  }

  const txid =
    "anchor" in envelope
      ? (envelope as { anchor?: { txid?: unknown } }).anchor?.txid
      : "txid" in envelope
        ? (envelope as { txid?: unknown }).txid
        : undefined;

  if (
    "publicReceipt" in envelope &&
    typeof (envelope as { publicReceipt?: unknown }).publicReceipt === "object" &&
    (envelope as { publicReceipt?: unknown }).publicReceipt !== null
  ) {
    return {
      receipt: parseTimestampPublicReceipt(
        (envelope as { publicReceipt: unknown }).publicReceipt,
      ),
      txid,
    };
  }

  if (
    "receipt" in envelope &&
    typeof (envelope as { receipt?: unknown }).receipt === "object" &&
    (envelope as { receipt?: unknown }).receipt !== null
  ) {
    return {
      receipt: parseTimestampPublicReceipt(
        (envelope as { receipt: unknown }).receipt,
      ),
      txid,
    };
  }

  return { receipt: parseTimestampPublicReceipt(value), txid };
}

async function readFetchRequest(request: Request): Promise<FetchRequestBody> {
  return (await readLimitedJsonObject(request, MAX_BODY_BYTES)) as FetchRequestBody;
}

function normalizeTxid(raw: unknown): string | null {
  if (typeof raw !== "string") {
    return null;
  }
  const trimmed = raw.trim().replace(/^0x/i, "").toLowerCase();
  return /^[0-9a-f]{64}$/.test(trimmed) ? trimmed : null;
}

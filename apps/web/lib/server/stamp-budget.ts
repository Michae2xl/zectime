import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

import { getClientIp } from "./client-ip";
import { ServerError } from "./error-kinds";

interface StampBudgetDay {
  total: number;
  byIp: Record<string, number>;
}

interface StampBudgetState {
  days: Record<string, StampBudgetDay>;
}

interface StampBudgetConfig {
  globalDailyLimit: number;
  ipDailyLimit: number;
  storePath: string;
  upstashUrl?: string;
  upstashToken?: string;
}

const DEFAULT_GLOBAL_DAILY_LIMIT = 25;
const DEFAULT_IP_DAILY_LIMIT = 3;
const STAMP_BUDGET_ENV_PREFIX = "ZECTIME_PUBLIC_STAMP";
let budgetLock: Promise<void> = Promise.resolve();
let activeStampOperations = 0;

export async function runPublicStampOperation<T>(
  operation: () => Promise<T>,
): Promise<T> {
  const concurrencyLimit = readPositiveIntegerEnv(
    `${STAMP_BUDGET_ENV_PREFIX}_CONCURRENCY`,
    1,
  );
  if (activeStampOperations >= concurrencyLimit) {
    throw new ServerError(
      "rate_limit",
      "Public timestamp service is busy; try again shortly",
    );
  }

  activeStampOperations += 1;
  try {
    return await operation();
  } finally {
    activeStampOperations -= 1;
  }
}

export async function reservePublicStampBudget(request: Request): Promise<void> {
  const config = getStampBudgetConfig();
  const ipHash = hashClientIp(getClientIp(request));
  const dayKey = new Date().toISOString().slice(0, 10);

  if (config.upstashUrl && config.upstashToken) {
    await reserveUpstashBudget(config, dayKey, ipHash);
    return;
  }

  const previous = budgetLock;
  let release: () => void = () => {};
  budgetLock = new Promise<void>((resolvePromise) => {
    release = resolvePromise;
  });
  await previous;

  try {
    const state = await readBudgetState(config.storePath);
    state.days = { [dayKey]: state.days[dayKey] ?? { total: 0, byIp: {} } };
    const day = state.days[dayKey];
    const ipCount = day.byIp[ipHash] ?? 0;

    if (day.total >= config.globalDailyLimit) {
      throw new ServerError(
        "rate_limit",
        "Public timestamp budget exhausted for today",
      );
    }

    if (ipCount >= config.ipDailyLimit) {
      throw new ServerError(
        "rate_limit",
        "Public timestamp limit reached for this client today",
      );
    }

    day.total += 1;
    day.byIp[ipHash] = ipCount + 1;
    await writeBudgetState(config.storePath, state);
  } finally {
    release();
  }
}

function getStampBudgetConfig(): StampBudgetConfig {
  const upstashUrl =
    process.env.ZECTIME_UPSTASH_REDIS_REST_URL ??
    process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken =
    process.env.ZECTIME_UPSTASH_REDIS_REST_TOKEN ??
    process.env.UPSTASH_REDIS_REST_TOKEN;
  if ((upstashUrl && !upstashToken) || (!upstashUrl && upstashToken)) {
    throw new ServerError(
      "validation",
      "Both Upstash Redis REST URL and token are required for external stamp budget storage",
    );
  }

  return {
    globalDailyLimit: readPositiveIntegerEnv(
      `${STAMP_BUDGET_ENV_PREFIX}_DAILY_LIMIT`,
      DEFAULT_GLOBAL_DAILY_LIMIT,
    ),
    ipDailyLimit: readPositiveIntegerEnv(
      `${STAMP_BUDGET_ENV_PREFIX}_IP_DAILY_LIMIT`,
      DEFAULT_IP_DAILY_LIMIT,
    ),
    storePath:
      process.env.ZECTIME_PUBLIC_STAMP_BUDGET_PATH ??
      join(
        /* turbopackIgnore: true */ resolveRuntimeDir(),
        "public-stamp-budget.json",
      ),
    upstashUrl,
    upstashToken,
  };
}

async function reserveUpstashBudget(
  config: StampBudgetConfig,
  dayKey: string,
  ipHash: string,
): Promise<void> {
  if (!config.upstashUrl || !config.upstashToken) {
    throw new ServerError("validation", "Upstash budget store is not configured");
  }

  const ttlSeconds = secondsUntilTomorrowUtc();
  const globalKey = `zectime:stamp:${dayKey}:global`;
  const ipKey = `zectime:stamp:${dayKey}:ip:${ipHash}`;
  const [globalCount, , ipCount] = await runUpstashPipeline(config, [
    ["INCR", globalKey],
    ["EXPIRE", globalKey, ttlSeconds],
    ["INCR", ipKey],
    ["EXPIRE", ipKey, ttlSeconds],
  ]);

  if (toInteger(globalCount) > config.globalDailyLimit) {
    throw new ServerError(
      "rate_limit",
      "Public timestamp budget exhausted for today",
    );
  }
  if (toInteger(ipCount) > config.ipDailyLimit) {
    throw new ServerError(
      "rate_limit",
      "Public timestamp limit reached for this client today",
    );
  }
}

async function runUpstashPipeline(
  config: StampBudgetConfig,
  commands: Array<Array<string | number>>,
): Promise<unknown[]> {
  if (!config.upstashUrl || !config.upstashToken) {
    throw new ServerError("validation", "Upstash budget store is not configured");
  }
  const endpoint = `${config.upstashUrl.replace(/\/+$/u, "")}/pipeline`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.upstashToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
  });

  if (!response.ok) {
    throw new ServerError(
      "rate_limit",
      `Public timestamp budget store returned HTTP ${response.status}`,
    );
  }

  const parsed = (await response.json()) as unknown;
  if (!Array.isArray(parsed)) {
    throw new ServerError("rate_limit", "Invalid budget store response");
  }

  return parsed.map((entry) => {
    if (
      typeof entry === "object" &&
      entry !== null &&
      "error" in entry &&
      (entry as { error?: unknown }).error
    ) {
      throw new ServerError("rate_limit", "Budget store command failed");
    }
    return typeof entry === "object" && entry !== null && "result" in entry
      ? (entry as { result?: unknown }).result
      : undefined;
  });
}

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new ServerError("validation", `${name} must be a positive integer`);
  }
  return parsed;
}

function hashClientIp(ip: string): string {
  const salt = process.env.ZECTIME_PUBLIC_STAMP_IP_SALT ?? "zectime";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

function secondsUntilTomorrowUtc(): number {
  const now = new Date();
  const tomorrow = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
  );
  return Math.max(60, Math.ceil((tomorrow - now.getTime()) / 1000));
}

function toInteger(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new ServerError("rate_limit", "Budget store returned non-integer count");
  }
  return parsed;
}

async function readBudgetState(path: string): Promise<StampBudgetState> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "days" in parsed &&
      typeof (parsed as { days?: unknown }).days === "object" &&
      (parsed as { days?: unknown }).days !== null
    ) {
      return parsed as StampBudgetState;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
  return { days: {} };
}

async function writeBudgetState(path: string, state: StampBudgetState): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmpPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmpPath, JSON.stringify(state, null, 2));
  await rename(tmpPath, path);
}

function resolveRuntimeDir(): string {
  const configured = process.env.ZECTIME_WEB_RUNTIME_DIR;
  if (configured) {
    return resolve(/* turbopackIgnore: true */ configured);
  }
  return resolve(
    /* turbopackIgnore: true */ join(tmpdir(), "zectime-web-runtime"),
  );
}

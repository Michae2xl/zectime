import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

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
}

const DEFAULT_GLOBAL_DAILY_LIMIT = 25;
const DEFAULT_IP_DAILY_LIMIT = 3;
const STAMP_BUDGET_ENV_PREFIX = "ZECTIME_PUBLIC_STAMP";
let budgetLock: Promise<void> = Promise.resolve();

export async function reservePublicStampBudget(request: Request): Promise<void> {
  const config = getStampBudgetConfig();
  const ip = getClientIp(request);
  const dayKey = new Date().toISOString().slice(0, 10);

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
    const ipCount = day.byIp[ip] ?? 0;

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
    day.byIp[ip] = ipCount + 1;
    await writeBudgetState(config.storePath, state);
  } finally {
    release();
  }
}

function getStampBudgetConfig(): StampBudgetConfig {
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
  };
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

function getClientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local"
  );
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

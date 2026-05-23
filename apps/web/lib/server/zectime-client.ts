import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

export type RuntimeNetwork = "regtest" | "testnet" | "mainnet";

interface ZecTimeRunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

interface ZecTimeRunOptions {
  cwd?: string;
  env?: Record<string, string | undefined>;
}

export interface ZecTimeConfig {
  cliBin: string;
  paramsPath: string;
  predicateParamsPath?: string;
  runtimeDir: string;
  network: RuntimeNetwork;
  rpcUrl?: string;
  fromAddress?: string;
  rpcUser?: string;
  rpcPassword?: string;
  walletDbPath?: string;
  cliTimeoutMs: number;
}

export interface TimestampReceipt {
  commitment_scheme?: string;
  commitment: string;
  block_height: number;
  nonce: string;
  doc_hash_lo: string;
  doc_hash_hi: string;
  doc_hash_sha256?: string;
  doc_hash_truncated?: string;
}

export interface TimestampPublicReceipt {
  commitment_scheme?: string;
  commitment: string;
  block_height: number;
}

export interface TimestampDocumentHash {
  docHashLo: string;
  docHashHi: string;
  docHashSha256: string;
  docHashTruncated: string;
}

export interface TimestampDocumentVerification extends TimestampDocumentHash {
  matchesReceipt: boolean;
  uploadedSizeBytes: number;
}

export interface TimestampFetchArtifact {
  txid: string;
  network: RuntimeNetwork;
  blockHeight: number;
  commitment: string;
  matchesReceipt: boolean | null;
}

export interface TimestampAnchorArtifact {
  txid: string;
  network: RuntimeNetwork;
  commitment: string;
  blockHeight: number | null;
  explorerUrl: string | null;
}

export interface TimestampCommitmentAnchorArtifact {
  anchor: TimestampAnchorArtifact;
}

export interface TimestampReceiptArtifact {
  receipt: TimestampReceipt;
  receiptPath: string;
  documentSizeBytes: number;
}

export interface PredicateWitness {
  doc_root: string;
  nonce: string;
  block_height: number;
  field_index: number;
  field_value: string;
  path_bits: boolean[];
  siblings: string[];
}

export interface PredicateProofArtifact {
  proofBase64: string;
  publicInputs: Record<string, string | number>;
}

export interface PredicateVerifyArtifact {
  publicInputs: Record<string, string | number>;
  matchesReceipt: boolean | null;
}

export const PREDICATE_TREE_DEPTH = 8;

const TIMESTAMP_COMMITMENT_SCHEME_V2 = "zectime-poseidon-pallas-v2";
const TIMESTAMP_COMMITMENT_SCHEME_V1 = "zectime-poseidon-pallas-v1";
const TIMESTAMP_FETCH_BLOCK_HEIGHT_PATTERN = /^\s*block_height:\s*(\d+)\s*$/m;
const TIMESTAMP_FETCH_COMMITMENT_PATTERN =
  /^\s*commitment:\s*0x([0-9a-fA-F]{64})\s*$/m;
const PREDICATE_INPUT_PATTERN =
  /^\s*\[(\d+)\]\s+(commitment|block_height|claim_hash)\s*=\s*(0x[0-9a-fA-F]+)\s*$/;

export function getZecTimeConfig(
  overrides: Partial<ZecTimeConfig> = {},
): ZecTimeConfig {
  return {
    cliBin: overrides.cliBin ?? getOptionalEnv("ZECTIME_CLI_BIN") ?? "zectime",
    paramsPath:
      overrides.paramsPath ?? getOptionalEnv("ZECTIME_PARAMS_PATH") ?? "",
    predicateParamsPath:
      overrides.predicateParamsPath ??
      getOptionalEnv("ZECTIME_PREDICATE_PARAMS_PATH"),
    runtimeDir: overrides.runtimeDir ?? resolveRuntimeDir(),
    network:
      overrides.network ??
      parseOptionalRuntimeNetwork(getOptionalEnv("ZECTIME_NETWORK")) ??
      parseOptionalRuntimeNetwork(getOptionalEnv("ZCASH_NETWORK")) ??
      "regtest",
    rpcUrl:
      overrides.rpcUrl ??
      getOptionalEnv("ZECTIME_RPC_URL") ??
      getOptionalEnv("ZALLET_RPC_URL"),
    fromAddress:
      overrides.fromAddress ??
      getOptionalEnv("ZECTIME_FROM_ADDRESS") ??
      getOptionalEnv("ZALLET_FROM_ADDRESS"),
    rpcUser:
      overrides.rpcUser ??
      getOptionalEnv("ZECTIME_RPC_USER") ??
      getOptionalEnv("ZALLET_RPC_USER"),
    rpcPassword:
      overrides.rpcPassword ??
      getOptionalEnv("ZECTIME_RPC_PASSWORD") ??
      getOptionalEnv("ZALLET_RPC_PASSWORD"),
    walletDbPath:
      overrides.walletDbPath ??
      getOptionalEnv("ZECTIME_WALLET_DB_PATH") ??
      getOptionalEnv("ZALLET_WALLET_DB_PATH"),
    cliTimeoutMs:
      overrides.cliTimeoutMs ??
      parsePositiveIntegerEnv("ZECTIME_CLI_TIMEOUT_MS", 15 * 60 * 1000),
  };
}

export function resolveRuntimePath(path: string, cwd = "."): string {
  return isAbsolute(path) ? path : resolve(/* turbopackIgnore: true */ cwd, path);
}

export async function createTimestampReceipt(
  documentBytes: Buffer,
  blockHeight = 0,
  overrides: Partial<ZecTimeConfig> = {},
): Promise<TimestampReceiptArtifact> {
  const config = getZecTimeConfig(overrides);
  const dir = await createRuntimeTempDir("zectime-stamp-", config.runtimeDir);
  const filePath = join(dir, "document.bin");
  const receiptPath = join(dir, "receipt.json");
  await writeFile(filePath, documentBytes);

  const args = ["timestamp", "stamp", "--file", filePath, "--out", receiptPath];
  if (blockHeight > 0) {
    args.push("--block-height", String(blockHeight));
  }

  await runZecTime(args, { cwd: dir, env: { ZECTIME_CLI_BIN: config.cliBin } });
  const receipt = parseTimestampReceiptJson(await readFile(receiptPath, "utf8"));
  return { receipt, receiptPath, documentSizeBytes: documentBytes.byteLength };
}

export function hashTimestampDocument(
  documentBytes: Buffer,
): TimestampDocumentHash {
  const digest = createHash("sha256").update(documentBytes).digest();
  return {
    docHashLo: readLittleEndianUInt(digest.subarray(0, 16))
      .toString(16)
      .padStart(32, "0"),
    docHashHi: readLittleEndianUInt(digest.subarray(16, 32))
      .toString(16)
      .padStart(32, "0"),
    docHashSha256: digest.toString("hex"),
    docHashTruncated: digest.subarray(0, 16).toString("hex"),
  };
}

export function verifyTimestampDocumentAgainstReceipt(
  documentBytes: Buffer,
  receipt: TimestampReceipt,
): TimestampDocumentVerification {
  const hash = hashTimestampDocument(documentBytes);
  return {
    ...hash,
    uploadedSizeBytes: documentBytes.byteLength,
    matchesReceipt: receipt.doc_hash_sha256
      ? hash.docHashLo === receipt.doc_hash_lo.toLowerCase() &&
        hash.docHashHi === receipt.doc_hash_hi.toLowerCase() &&
        hash.docHashSha256 === receipt.doc_hash_sha256.toLowerCase()
      : hash.docHashLo.slice(16) === receipt.doc_hash_lo.toLowerCase() &&
        hash.docHashLo.slice(0, 16) === receipt.doc_hash_hi.toLowerCase() &&
        hash.docHashTruncated === receipt.doc_hash_truncated?.toLowerCase(),
  };
}

export async function fetchTimestampAnchor(
  txid: string,
  options: { receipt?: TimestampPublicReceipt } = {},
  overrides: Partial<ZecTimeConfig> = {},
): Promise<TimestampFetchArtifact> {
  const config = getZecTimeConfig(overrides);
  if (!config.rpcUrl) {
    throw new Error("Missing anchor fetch configuration: rpcUrl is required");
  }
  const dir = await createRuntimeTempDir("zectime-fetch-", config.runtimeDir);
  try {
    const result = await runZecTime(
      [
        "timestamp",
        "fetch",
        "--txid",
        txid,
        "--rpc-url",
        config.rpcUrl,
        "--network",
        config.network,
      ],
      { cwd: dir, env: buildRuntimeEnv(config) },
    );
    const height = result.stdout.match(TIMESTAMP_FETCH_BLOCK_HEIGHT_PATTERN)?.[1];
    const commitment = result.stdout
      .match(TIMESTAMP_FETCH_COMMITMENT_PATTERN)?.[1]
      ?.toLowerCase();
    if (!height || !commitment) {
      throw new Error("Missing expected fields in zectime timestamp fetch output");
    }
    const blockHeight = Number(height);
    return {
      txid: txid.toLowerCase(),
      network: config.network,
      blockHeight,
      commitment,
      matchesReceipt: options.receipt
        ? options.receipt.commitment.toLowerCase() === commitment &&
          options.receipt.block_height === blockHeight
        : null,
    };
  } finally {
    await removeRuntimeTempDir(dir);
  }
}

export async function anchorTimestampReceipt(
  receipt: TimestampReceipt,
  overrides: Partial<ZecTimeConfig> = {},
): Promise<TimestampAnchorArtifact> {
  const config = getZecTimeConfig(overrides);
  if (!config.rpcUrl || !config.fromAddress) {
    throw new Error(
      "Missing anchor configuration: rpcUrl and fromAddress are required",
    );
  }
  const dir = await createRuntimeTempDir("zectime-anchor-", config.runtimeDir);
  try {
    const receiptPath = join(dir, "receipt.json");
    const metaPath = join(dir, "anchor.json");
    await writeFile(receiptPath, JSON.stringify(receipt, null, 2));
    await runZecTime(
      [
        "timestamp",
        "anchor",
        "--receipt",
        receiptPath,
        "--rpc-url",
        config.rpcUrl,
        "--from-address",
        config.fromAddress,
        "--network",
        config.network,
        "--out",
        metaPath,
      ],
      { cwd: dir, env: buildRuntimeEnv(config) },
    );
    const raw = JSON.parse(await readFile(metaPath, "utf8")) as {
      txid: string;
      network: string;
      commitment: string;
      block_height?: number | null;
    };
    const network = parseRuntimeNetwork(raw.network);
    const txid = raw.txid.toLowerCase();
    return {
      txid,
      network,
      commitment: raw.commitment.toLowerCase(),
      blockHeight: typeof raw.block_height === "number" ? raw.block_height : null,
      explorerUrl: buildZcashExplorerUrl(network, txid),
    };
  } finally {
    await removeRuntimeTempDir(dir);
  }
}

export async function anchorTimestampCommitment(
  commitment: string,
  overrides: Partial<ZecTimeConfig> = {},
): Promise<TimestampCommitmentAnchorArtifact> {
  const normalizedCommitment = normalizeFixedHex(commitment, 64, "commitment");
  const anchor = await anchorTimestampReceipt(
    {
      commitment_scheme: TIMESTAMP_COMMITMENT_SCHEME_V2,
      commitment: normalizedCommitment,
      block_height: 0,
      nonce: "0".repeat(32),
      doc_hash_lo: "0".repeat(32),
      doc_hash_hi: "0".repeat(32),
      doc_hash_sha256: "0".repeat(64),
    },
    overrides,
  );
  const fetched = await fetchTimestampAnchor(anchor.txid, {}, overrides);
  if (fetched.commitment !== normalizedCommitment) {
    throw new Error("Fetched timestamp commitment does not match client commitment");
  }
  return { anchor: { ...anchor, blockHeight: fetched.blockHeight } };
}

export function parseTimestampReceiptJson(raw: string): TimestampReceipt {
  return parseTimestampReceipt(JSON.parse(raw) as unknown);
}

export function parseTimestampReceipt(value: unknown): TimestampReceipt {
  if (typeof value !== "object" || value === null) {
    throw new Error("Invalid timestamp receipt: expected object");
  }
  const parsed = value as Partial<TimestampReceipt>;
  if (
    typeof parsed.commitment !== "string" ||
    typeof parsed.nonce !== "string" ||
    typeof parsed.doc_hash_lo !== "string" ||
    typeof parsed.doc_hash_hi !== "string" ||
    (typeof parsed.doc_hash_sha256 !== "string" &&
      typeof parsed.doc_hash_truncated !== "string") ||
    typeof parsed.block_height !== "number"
  ) {
    throw new Error("Invalid timestamp receipt: missing or wrong-typed fields");
  }
  if (!Number.isInteger(parsed.block_height) || parsed.block_height < 0) {
    throw new Error("Invalid timestamp receipt: block_height must be non-negative");
  }
  const explicitScheme =
    typeof parsed.commitment_scheme === "string"
      ? parsed.commitment_scheme
      : undefined;
  const usesV2 =
    explicitScheme === TIMESTAMP_COMMITMENT_SCHEME_V2 ||
    typeof parsed.doc_hash_sha256 === "string";

  return {
    commitment_scheme: usesV2
      ? TIMESTAMP_COMMITMENT_SCHEME_V2
      : TIMESTAMP_COMMITMENT_SCHEME_V1,
    commitment: normalizeFixedHex(parsed.commitment, 64, "commitment"),
    block_height: parsed.block_height,
    nonce: normalizeFixedHex(parsed.nonce, usesV2 ? 32 : 16, "nonce"),
    doc_hash_lo: normalizeFixedHex(
      parsed.doc_hash_lo,
      usesV2 ? 32 : 16,
      "doc_hash_lo",
    ),
    doc_hash_hi: normalizeFixedHex(
      parsed.doc_hash_hi,
      usesV2 ? 32 : 16,
      "doc_hash_hi",
    ),
    ...(usesV2
      ? {
          doc_hash_sha256: normalizeFixedHex(
            parsed.doc_hash_sha256 ?? "",
            64,
            "doc_hash_sha256",
          ),
        }
      : {
          doc_hash_truncated: normalizeFixedHex(
            parsed.doc_hash_truncated ?? "",
            32,
            "doc_hash_truncated",
          ),
        }),
  };
}

export function parseTimestampPublicReceipt(
  value: unknown,
): TimestampPublicReceipt {
  if (typeof value !== "object" || value === null) {
    throw new Error("Invalid timestamp public receipt: expected object");
  }
  const parsed = value as Partial<TimestampPublicReceipt>;
  if (
    typeof parsed.commitment !== "string" ||
    typeof parsed.block_height !== "number"
  ) {
    throw new Error(
      "Invalid timestamp public receipt: missing or wrong-typed fields",
    );
  }
  return {
    ...(typeof parsed.commitment_scheme === "string"
      ? { commitment_scheme: parsed.commitment_scheme }
      : {}),
    commitment: normalizeFixedHex(parsed.commitment, 64, "commitment"),
    block_height: parsed.block_height,
  };
}

export function parsePredicateWitness(value: unknown): PredicateWitness {
  if (typeof value !== "object" || value === null) {
    throw new Error("Invalid predicate witness: expected object");
  }
  const parsed = value as Partial<PredicateWitness>;
  if (
    typeof parsed.doc_root !== "string" ||
    typeof parsed.nonce !== "string" ||
    typeof parsed.field_value !== "string" ||
    typeof parsed.block_height !== "number" ||
    typeof parsed.field_index !== "number" ||
    !Array.isArray(parsed.path_bits) ||
    !Array.isArray(parsed.siblings)
  ) {
    throw new Error("Invalid predicate witness: missing fields");
  }
  if (parsed.path_bits.length !== PREDICATE_TREE_DEPTH) {
    throw new Error("path_bits must have exactly 8 entries");
  }
  if (parsed.siblings.length !== PREDICATE_TREE_DEPTH) {
    throw new Error("siblings must have exactly 8 entries");
  }
  return {
    doc_root: normalizeFieldWithPrefix(parsed.doc_root),
    nonce: normalizeFieldWithPrefix(parsed.nonce),
    block_height: parsed.block_height,
    field_index: parsed.field_index,
    field_value: normalizeFieldWithPrefix(parsed.field_value),
    path_bits: parsed.path_bits.map(Boolean),
    siblings: parsed.siblings.map(normalizeFieldWithPrefix),
  };
}

export async function createPredicateProof(
  witness: PredicateWitness,
  overrides: Partial<ZecTimeConfig> = {},
): Promise<PredicateProofArtifact> {
  const config = getZecTimeConfig(overrides);
  if (!config.predicateParamsPath) {
    throw new Error("Missing ZECTIME_PREDICATE_PARAMS_PATH");
  }
  const dir = await createRuntimeTempDir("zectime-predicate-prove-", config.runtimeDir);
  try {
    const witnessPath = join(dir, "witness.json");
    const proofPath = join(dir, "predicate-proof.bin");
    await writeFile(witnessPath, JSON.stringify(witness, null, 2));
    const result = await runZecTime(
      [
        "timestamp",
        "predicate-prove",
        "--params",
        resolveRuntimePath(config.predicateParamsPath),
        "--witness",
        witnessPath,
        "--out",
        proofPath,
      ],
      { cwd: dir, env: buildRuntimeEnv(config) },
    );
    return {
      proofBase64: (await readFile(proofPath)).toString("base64"),
      publicInputs: parsePredicatePublicInputsFromOutput(result.stdout),
    };
  } finally {
    await removeRuntimeTempDir(dir);
  }
}

export async function verifyPredicateProof(
  proofBase64: string,
  options: { receipt?: TimestampReceipt } = {},
  overrides: Partial<ZecTimeConfig> = {},
): Promise<PredicateVerifyArtifact> {
  const config = getZecTimeConfig(overrides);
  if (!config.predicateParamsPath) {
    throw new Error("Missing ZECTIME_PREDICATE_PARAMS_PATH");
  }
  const dir = await createRuntimeTempDir("zectime-predicate-verify-", config.runtimeDir);
  try {
    const proofPath = join(dir, "predicate-proof.bin");
    const receiptPath = join(dir, "receipt.json");
    await writeFile(proofPath, Buffer.from(proofBase64, "base64"));
    const args = [
      "timestamp",
      "predicate-verify",
      "--params",
      resolveRuntimePath(config.predicateParamsPath),
      "--proof",
      proofPath,
    ];
    if (options.receipt) {
      await writeFile(receiptPath, JSON.stringify(options.receipt, null, 2));
      args.push("--receipt", receiptPath);
    }
    const result = await runZecTime(args, { cwd: dir, env: buildRuntimeEnv(config) });
    const publicInputs = parsePredicatePublicInputsFromOutput(result.stdout);
    return { publicInputs, matchesReceipt: options.receipt ? true : null };
  } finally {
    await removeRuntimeTempDir(dir);
  }
}

export function parsePredicatePublicInputsFromOutput(
  output: string,
): Record<string, string | number> {
  const found: Record<string, string | number> = {};
  for (const line of output.split(/\r?\n/u)) {
    const match = line.match(PREDICATE_INPUT_PATTERN);
    if (!match) continue;
    const [, indexText, label, hexValue] = match;
    const index = Number(indexText);
    if (label === "commitment" && index === 0) {
      found.commitment = parseDisplayHexToRawHex(hexValue);
    }
    if (label === "block_height" && index === 1) {
      found.blockHeight = parseDisplayHexToSafeNumber(hexValue, label);
    }
    if (label === "claim_hash" && index === 2) {
      found.claimHash = parseDisplayHexToRawHex(hexValue);
    }
  }
  if (
    typeof found.commitment !== "string" ||
    typeof found.blockHeight !== "number" ||
    typeof found.claimHash !== "string"
  ) {
    throw new Error("Missing predicate public input lines in zectime output");
  }
  return found;
}

export function buildZcashExplorerUrl(
  network: RuntimeNetwork,
  txid: string,
): string | null {
  if (network === "mainnet") {
    return `https://mainnet.zcashexplorer.app/transactions/${txid}`;
  }
  if (network === "testnet") {
    return `https://testnet.zcashexplorer.app/transactions/${txid}`;
  }
  return null;
}

async function runZecTime(
  args: string[],
  options: ZecTimeRunOptions = {},
): Promise<ZecTimeRunResult> {
  const config = getZecTimeConfig();
  const child = spawn(options.env?.ZECTIME_CLI_BIN ?? config.cliBin, args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    child.kill("SIGKILL");
  }, config.cliTimeoutMs);
  child.stdout.setEncoding("utf8").on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.setEncoding("utf8").on("data", (chunk) => {
    stderr += chunk;
  });
  const exitCode = await new Promise<number | null>((resolvePromise, reject) => {
    child.on("error", reject);
    child.on("close", resolvePromise);
  });
  clearTimeout(timeoutId);
  if (timedOut) {
    throw new Error(`zectime timed out after ${config.cliTimeoutMs}ms`);
  }
  if (exitCode !== 0) {
    throw new Error(stderr || stdout || `zectime exited with code ${exitCode}`);
  }
  return { stdout, stderr, exitCode: exitCode ?? 0 };
}

function buildRuntimeEnv(config: ZecTimeConfig): Record<string, string | undefined> {
  return {
    ZECTIME_CLI_BIN: config.cliBin,
    ZECTIME_NETWORK: config.network,
    ZECTIME_RPC_URL: config.rpcUrl,
    ZECTIME_FROM_ADDRESS: config.fromAddress,
    ZECTIME_RPC_USER: config.rpcUser,
    ZECTIME_RPC_PASSWORD: config.rpcPassword,
    ZECTIME_WALLET_DB_PATH: config.walletDbPath,
  };
}

async function createRuntimeTempDir(prefix: string, baseDir = resolveRuntimeDir()): Promise<string> {
  await mkdir(baseDir, { recursive: true });
  return mkdtemp(join(/* turbopackIgnore: true */ baseDir, prefix));
}

async function removeRuntimeTempDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

function resolveRuntimeDir(): string {
  return resolve(
    process.env.ZECTIME_WEB_RUNTIME_DIR ??
      join(tmpdir(), "zectime-web-runtime"),
  );
}

function getOptionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

function parsePositiveIntegerEnv(name: string, fallback: number): number {
  const value = getOptionalEnv(name);
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function parseOptionalRuntimeNetwork(
  network: string | undefined,
): RuntimeNetwork | undefined {
  return network ? parseRuntimeNetwork(network) : undefined;
}

function parseRuntimeNetwork(network: string): RuntimeNetwork {
  if (network === "mainnet" || network === "testnet" || network === "regtest") {
    return network;
  }
  throw new Error(`Unsupported Zcash network: ${network}`);
}

function readLittleEndianUInt(input: Buffer): bigint {
  let value = 0n;
  for (let index = input.byteLength - 1; index >= 0; index -= 1) {
    value = (value << 8n) + BigInt(input[index]);
  }
  return value;
}

function normalizeFixedHex(value: string, length: number, field: string): string {
  const normalized = value.trim().replace(/^0x/iu, "").toLowerCase();
  const pattern = new RegExp(`^[0-9a-f]{${length}}$`, "u");
  if (!pattern.test(normalized)) {
    throw new Error(`${field} must be ${length} hex chars`);
  }
  return normalized;
}

function normalizeFieldWithPrefix(value: string): string {
  return `0x${normalizeFixedHex(value, 64, "field element")}`;
}

function parseDisplayHexToSafeNumber(hexValue: string, label: string): number {
  const value = BigInt(hexValue);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${label} exceeds JavaScript safe integer range`);
  }
  return Number(value);
}

function parseDisplayHexToRawHex(hexValue: string): string {
  const normalized = hexValue.replace(/^0x/iu, "").toLowerCase();
  const bytes = normalized.match(/../g);
  return bytes ? bytes.reverse().join("") : normalized;
}

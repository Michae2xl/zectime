"use client";

import Link from "next/link";
import { useState, type ChangeEvent, type FormEvent } from "react";

import { withProductLocale } from "../../../lib/locale";
import { extractServerErrorMessage } from "../../../lib/server-error-message";
import {
  verifyClientTimestampDocument,
  type ClientTimestampDocumentVerification,
  type ClientTimestampPrivateOpening,
  type ClientTimestampPublicReceipt,
} from "../../../lib/timestamp-client-crypto";
import type { ProductLocale } from "../../../lib/types";
import {
  type ZkTimestampCopy,
} from "../../../lib/zk-timestamp";
import { ProductLocaleToggle } from "../locale/product-locale-toggle";

interface ZkTimestampVerifyPanelProps {
  locale: ProductLocale;
  copy: ZkTimestampCopy;
}

interface FetchArtifact {
  txid: string;
  network: string;
  blockHeight: number;
  commitment: string;
  matchesReceipt: boolean | null;
}

interface FetchResponse {
  artifact: FetchArtifact;
  documentVerification: null;
}

type Status = "idle" | "busy" | "error" | "success";

export function ZkTimestampVerifyPanel({
  locale,
  copy,
}: ZkTimestampVerifyPanelProps) {
  const verify = copy.verify;
  const [txid, setTxid] = useState<string>("");
  const [receiptJson, setReceiptJson] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [artifact, setArtifact] = useState<FetchArtifact | null>(null);
  const [publicReceipt, setPublicReceipt] =
    useState<ClientTimestampPublicReceipt | null>(null);
  const [documentVerification, setDocumentVerification] =
    useState<ClientTimestampDocumentVerification | null>(null);

  function onTxidChange(event: ChangeEvent<HTMLInputElement>) {
    setTxid(event.target.value);
  }

  function onReceiptChange(event: ChangeEvent<HTMLTextAreaElement>) {
    setReceiptJson(event.target.value);
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0] ?? null;
    setFile(next);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setArtifact(null);
    setPublicReceipt(null);
    setDocumentVerification(null);

    let parsedInput: ParsedReceiptInput = {};
    const rawReceipt = receiptJson.trim();
    if (rawReceipt) {
      try {
        parsedInput = parseReceiptInput(rawReceipt);
      } catch {
        setStatus("error");
        setErrorMessage(verify.errors.invalidReceipt);
        return;
      }
    }

    const normalizedTxid =
      normalizeTxid(txid) ?? normalizeTxid(parsedInput.txid ?? "");
    if (!normalizedTxid) {
      setStatus("error");
      setErrorMessage(verify.errors.missingTxid);
      return;
    }

    if (file && (!parsedInput.publicReceipt || !parsedInput.privateOpening)) {
      setStatus("error");
      setErrorMessage(verify.errors.invalidReceipt);
      return;
    }

    setStatus("busy");
    try {
      const response = await fetch("/api/timestamps/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          txid: normalizedTxid,
          ...(parsedInput.publicReceipt
            ? { receipt: parsedInput.publicReceipt }
            : {}),
        }),
      });

      const body = (await response.json()) as unknown;

      if (!response.ok) {
        throw new Error(
          extractServerErrorMessage(body, `HTTP ${response.status}`),
        );
      }

      const payload = body as FetchResponse;
      const localDocumentVerification =
        file && parsedInput.publicReceipt && parsedInput.privateOpening
          ? await verifyClientTimestampDocument(
              file,
              parsedInput.publicReceipt,
              parsedInput.privateOpening,
            )
          : null;

      setArtifact(payload.artifact);
      setPublicReceipt(parsedInput.publicReceipt ?? null);
      setDocumentVerification(localDocumentVerification);
      setStatus("success");
    } catch (caught) {
      setStatus("error");
      const message = caught instanceof Error ? caught.message : String(caught);
      setErrorMessage(`${verify.errors.serverError}${message}`);
    }
  }

  const resultTitle = pickResultTitle(artifact, verify);

  return (
    <main className="page-shell product-shell zk-hub-shell zk-timestamp-shell">
      <div className="background-grid" aria-hidden="true" />

      <header className="frame zk-hub-topbar surface-reveal">
        <div className="zk-hub-topbar-brand">
          <p className="eyebrow zk-hub-topbar-eyebrow">
            {verify.shell.eyebrow}
          </p>
          <Link
            className="zk-hub-topbar-back"
            href={withProductLocale("/timestamp", locale)}
          >
            {verify.shell.backLabel}
          </Link>
        </div>
        <div className="zk-hub-topbar-tools">
          <ProductLocaleToggle
            locale={locale}
            ariaLabel={verify.shell.eyebrow}
          />
        </div>
      </header>

      <div className="zk-hub-body">
        <section
          className="frame zk-hub-hero surface-reveal"
          aria-labelledby="zk-timestamp-verify-title"
        >
          <p className="eyebrow">{verify.shell.eyebrow}</p>
          <h1 id="zk-timestamp-verify-title">{verify.shell.title}</h1>
          <p className="hero-copy zk-hub-hero-body">{verify.shell.body}</p>
        </section>

        <section
          className="frame zk-hub-section surface-reveal"
          aria-labelledby="zk-timestamp-verify-form-title"
        >
          <header className="zk-hub-section-header">
            <h2 id="zk-timestamp-verify-form-title">
              {verify.form.submitLabel}
            </h2>
          </header>

          <form
            className="zk-hub-form"
            onSubmit={onSubmit}
            aria-busy={status === "busy"}
          >
            <label className="zk-hub-form-field">
              <span className="zk-hub-form-label">{verify.form.txidLabel}</span>
              <input
                type="text"
                value={txid}
                onChange={onTxidChange}
                disabled={status === "busy"}
                aria-describedby="zk-timestamp-verify-txid-hint"
                spellCheck={false}
                autoComplete="off"
              />
              <span
                id="zk-timestamp-verify-txid-hint"
                className="zk-hub-form-hint"
              >
                {verify.form.txidHint}
              </span>
            </label>

            <label className="zk-hub-form-field">
              <span className="zk-hub-form-label">
                {verify.form.receiptLabel}
              </span>
              <textarea
                rows={6}
                value={receiptJson}
                onChange={onReceiptChange}
                disabled={status === "busy"}
                aria-describedby="zk-timestamp-verify-receipt-hint"
                spellCheck={false}
              />
              <span
                id="zk-timestamp-verify-receipt-hint"
                className="zk-hub-form-hint"
              >
                {verify.form.receiptHint}
              </span>
            </label>

            <label className="zk-hub-form-field">
              <span className="zk-hub-form-label">{verify.form.fileLabel}</span>
              <span
                className="zk-hub-file-picker"
                data-disabled={String(status === "busy")}
              >
                <input
                  className="zk-hub-file-input"
                  type="file"
                  onChange={onFileChange}
                  disabled={status === "busy"}
                  aria-describedby="zk-timestamp-verify-file-hint"
                />
                <span className="zk-hub-file-button">
                  {verify.form.chooseFileLabel}
                </span>
                <span className="zk-hub-file-name">
                  {file?.name ?? verify.form.fileEmptyLabel}
                </span>
              </span>
              <span
                id="zk-timestamp-verify-file-hint"
                className="zk-hub-form-hint"
              >
                {verify.form.fileHint}
              </span>
            </label>

            <div className="button-row zk-hub-hero-actions">
              <button
                type="submit"
                className="button-primary"
                disabled={status === "busy"}
              >
                {status === "busy"
                  ? verify.form.busyLabel
                  : verify.form.submitLabel}
              </button>
            </div>
          </form>

          {status === "error" && errorMessage ? (
            <p className="zk-hub-form-error" role="alert">
              {errorMessage}
            </p>
          ) : null}
        </section>

        {artifact ? (
          <section
            className="frame zk-hub-section surface-reveal"
            aria-labelledby="zk-timestamp-verify-result-title"
            data-match={String(artifact.matchesReceipt)}
          >
            <header className="zk-hub-section-header">
              <p className="eyebrow">{verify.result.eyebrow}</p>
              <h2 id="zk-timestamp-verify-result-title">{resultTitle}</h2>
            </header>

            <dl className="zk-hub-stack-grid">
              <ResultRow
                label={verify.result.txidLabel}
                value={`0x${artifact.txid}`}
              />
              <ResultRow
                label={verify.result.networkLabel}
                value={artifact.network}
              />
              <ResultRow
                label={verify.result.blockHeightLabel}
                value={String(artifact.blockHeight)}
              />
              <ResultRow
                label={verify.result.commitmentLabel}
                value={`0x${artifact.commitment}`}
              />
              {publicReceipt ? (
                <>
                  <ResultRow
                    label={verify.result.receiptCommitmentLabel}
                    value={`0x${publicReceipt.commitment}`}
                  />
                  <ResultRow
                    label={verify.result.receiptBlockHeightLabel}
                    value={String(publicReceipt.block_height)}
                  />
                </>
              ) : null}
            </dl>

            {documentVerification ? (
              <p
                className="zk-hub-verification-banner"
                data-match={String(documentVerification.matchesReceipt)}
              >
                {documentVerification.matchesReceipt
                  ? verify.result.documentMatchTitle
                  : verify.result.documentMismatchTitle}
              </p>
            ) : null}
          </section>
        ) : null}
      </div>
    </main>
  );
}

function normalizeTxid(value: string): string | null {
  const normalized = value.trim().replace(/^0x/i, "").toLowerCase();
  return /^[0-9a-f]{64}$/.test(normalized) ? normalized : null;
}

interface ParsedReceiptInput {
  publicReceipt?: ClientTimestampPublicReceipt;
  privateOpening?: ClientTimestampPrivateOpening;
  txid?: string;
}

function parseReceiptInput(rawReceipt: string): ParsedReceiptInput {
  const parsed = JSON.parse(rawReceipt) as unknown;
  const envelope =
    typeof parsed === "object" && parsed !== null ? parsed : undefined;

  const publicReceiptCandidate =
    envelope && "publicReceipt" in envelope
      ? (envelope as { publicReceipt?: unknown }).publicReceipt
      : envelope && "receipt" in envelope
        ? (envelope as { receipt?: unknown }).receipt
        : parsed;
  const privateOpeningCandidate =
    envelope && "privateOpening" in envelope
      ? (envelope as { privateOpening?: unknown }).privateOpening
      : envelope && "receipt" in envelope
        ? (envelope as { receipt?: unknown }).receipt
        : hasPrivateOpeningShape(parsed)
          ? parsed
          : undefined;

  if (!hasPublicReceiptShape(publicReceiptCandidate)) {
    throw new Error("invalid receipt");
  }

  const txid =
    envelope && "anchor" in envelope
      ? (envelope as { anchor?: { txid?: unknown } }).anchor?.txid
      : envelope && "txid" in envelope
        ? (envelope as { txid?: unknown }).txid
        : undefined;

  return {
    publicReceipt: parsePublicReceipt(publicReceiptCandidate),
    privateOpening: hasPrivateOpeningShape(privateOpeningCandidate)
      ? parsePrivateOpening(privateOpeningCandidate)
      : undefined,
    txid: typeof txid === "string" ? txid : undefined,
  };
}

function hasPublicReceiptShape(value: unknown): value is {
  commitment: unknown;
  block_height: unknown;
} {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { commitment?: unknown }).commitment === "string" &&
    typeof (value as { block_height?: unknown }).block_height === "number"
  );
}

function hasPrivateOpeningShape(value: unknown): value is {
  commitment_scheme?: unknown;
  nonce: unknown;
  doc_hash_lo: unknown;
  doc_hash_hi: unknown;
  doc_hash_sha256?: unknown;
  doc_hash_truncated?: unknown;
} {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { nonce?: unknown }).nonce === "string" &&
    typeof (value as { doc_hash_lo?: unknown }).doc_hash_lo === "string" &&
    typeof (value as { doc_hash_hi?: unknown }).doc_hash_hi === "string" &&
    (typeof (value as { doc_hash_sha256?: unknown }).doc_hash_sha256 ===
      "string" ||
      typeof (value as { doc_hash_truncated?: unknown }).doc_hash_truncated ===
        "string")
  );
}

function parsePublicReceipt(value: {
  commitment_scheme?: unknown;
  commitment: unknown;
  block_height: unknown;
}): ClientTimestampPublicReceipt {
  const commitment = normalizeHex(value.commitment, 64);
  if (typeof value.block_height !== "number" || value.block_height < 0) {
    throw new Error("invalid receipt");
  }
  return {
    ...(typeof value.commitment_scheme === "string"
      ? { commitment_scheme: value.commitment_scheme }
      : {}),
    commitment,
    block_height: value.block_height,
  };
}

function parsePrivateOpening(value: {
  commitment_scheme?: unknown;
  nonce: unknown;
  doc_hash_lo: unknown;
  doc_hash_hi: unknown;
  doc_hash_sha256?: unknown;
  doc_hash_truncated?: unknown;
  document_size_bytes?: unknown;
}): ClientTimestampPrivateOpening {
  const isLegacy =
    value.commitment_scheme === "zectime-poseidon-pallas-v1" ||
    (typeof value.doc_hash_truncated === "string" &&
      typeof value.doc_hash_sha256 !== "string");

  return {
    commitment_scheme: isLegacy
      ? "zectime-poseidon-pallas-v1"
      : "zectime-poseidon-pallas-v2",
    nonce: normalizeHex(value.nonce, isLegacy ? 16 : 32),
    doc_hash_lo: normalizeHex(value.doc_hash_lo, isLegacy ? 16 : 32),
    doc_hash_hi: normalizeHex(value.doc_hash_hi, isLegacy ? 16 : 32),
    ...(isLegacy
      ? { doc_hash_truncated: normalizeHex(value.doc_hash_truncated, 32) }
      : { doc_hash_sha256: normalizeHex(value.doc_hash_sha256, 64) }),
    ...(typeof value.document_size_bytes === "number"
      ? { document_size_bytes: value.document_size_bytes }
      : {}),
  };
}

function normalizeHex(value: unknown, length: number): string {
  if (typeof value !== "string") {
    throw new Error("invalid receipt");
  }
  const normalized = value.trim().replace(/^0x/iu, "").toLowerCase();
  const pattern = new RegExp(`^[0-9a-f]{${length}}$`, "u");
  if (!pattern.test(normalized)) {
    throw new Error("invalid receipt");
  }
  return normalized;
}

function pickResultTitle(
  artifact: FetchArtifact | null,
  verify: ZkTimestampCopy["verify"],
): string {
  if (!artifact) {
    return "";
  }
  if (artifact.matchesReceipt === true) {
    return verify.result.matchTitle;
  }
  if (artifact.matchesReceipt === false) {
    return verify.result.mismatchTitle;
  }
  return verify.result.noReceiptTitle;
}

interface ResultRowProps {
  label: string;
  value: string;
}

function ResultRow({ label, value }: ResultRowProps) {
  return (
    <div className="zk-hub-stack-block">
      <span className="zk-hub-stack-label">{label}</span>
      <strong className="zk-hub-stack-value" style={{ wordBreak: "break-all" }}>
        <code>{value}</code>
      </strong>
    </div>
  );
}

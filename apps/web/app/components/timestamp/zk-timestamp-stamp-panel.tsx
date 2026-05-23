"use client";

import Link from "next/link";
import { useState, type ChangeEvent, type FormEvent } from "react";

import { withProductLocale } from "../../../lib/locale";
import { extractServerErrorMessage } from "../../../lib/server-error-message";
import {
  buildClientTimestampPrivateOpening,
  buildClientTimestampPublicReceipt,
  createClientTimestampDraft,
  type ClientTimestampPrivateOpening,
  type ClientTimestampPublicReceipt,
} from "../../../lib/timestamp-client-crypto";
import type { ProductLocale } from "../../../lib/types";
import {
  type ZkTimestampCopy,
} from "../../../lib/zk-timestamp";
import { ProductLocaleToggle } from "../locale/product-locale-toggle";

interface ZkTimestampStampPanelProps {
  locale: ProductLocale;
  copy: ZkTimestampCopy;
}

interface TimestampReceiptPayload {
  commitment_scheme: string;
  commitment: string;
  block_height: number;
  nonce: string;
  doc_hash_lo: string;
  doc_hash_hi: string;
  doc_hash_sha256: string;
}

interface StampResponse {
  anchor: AnchorArtifact;
}

interface StampResult {
  publicReceipt: ClientTimestampPublicReceipt;
  privateOpening: ClientTimestampPrivateOpening;
  documentSizeBytes: number;
  anchor: AnchorArtifact;
}

interface AnchorArtifact {
  txid: string;
  network: string;
  commitment: string;
  blockHeight: number | null;
  explorerUrl: string | null;
}

type Status = "idle" | "busy" | "error" | "success";

export function ZkTimestampStampPanel({
  locale,
  copy,
}: ZkTimestampStampPanelProps) {
  const stamp = copy.stamp;
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [result, setResult] = useState<StampResult | null>(null);

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0] ?? null;
    setFile(next);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setResult(null);

    if (!file) {
      setStatus("error");
      setErrorMessage(stamp.errors.missingFile);
      return;
    }

    setStatus("busy");
    try {
      const draft = await createClientTimestampDraft(file);

      const response = await fetch("/api/timestamps/stamp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commitment: draft.receipt.commitment }),
      });

      const body = (await response.json()) as unknown;

      if (!response.ok) {
        if (isMissingAnchorConfig(body)) {
          throw new Error(stamp.errors.missingAnchorConfig);
        }
        throw new Error(
          extractServerErrorMessage(body, `HTTP ${response.status}`),
        );
      }

      const payload = body as StampResponse;
      const receipt: TimestampReceiptPayload = {
        ...draft.receipt,
        block_height: payload.anchor.blockHeight ?? 0,
      };
      setResult({
        publicReceipt: buildClientTimestampPublicReceipt(receipt),
        privateOpening: buildClientTimestampPrivateOpening(
          receipt,
          draft.documentSizeBytes,
        ),
        documentSizeBytes: draft.documentSizeBytes,
        anchor: payload.anchor,
      });
      setStatus("success");
    } catch (caught) {
      setStatus("error");
      const message = caught instanceof Error ? caught.message : String(caught);
      setErrorMessage(
        message === stamp.errors.missingAnchorConfig
          ? message
          : `${stamp.errors.serverError}${message}`,
      );
    }
  }

  function buildPublicReceiptDownload(): string | null {
    if (!result) {
      return null;
    }
    const json = JSON.stringify(
      {
        schema: "zectime.public-receipt.v2",
        txid: result.anchor.txid,
        network: result.anchor.network,
        publicReceipt: result.publicReceipt,
        anchor: result.anchor,
      },
      null,
      2,
    );
    return `data:application/json;charset=utf-8,${encodeURIComponent(json)}`;
  }

  function buildPrivateOpeningDownload(): string | null {
    if (!result) {
      return null;
    }
    const json = JSON.stringify(
      {
        schema: "zectime.private-opening.v1",
        txid: result.anchor.txid,
        network: result.anchor.network,
        publicReceipt: result.publicReceipt,
        privateOpening: result.privateOpening,
        document: {
          size_bytes: result.documentSizeBytes,
        },
      },
      null,
      2,
    );
    return `data:application/json;charset=utf-8,${encodeURIComponent(json)}`;
  }

  const publicReceiptHref = buildPublicReceiptDownload();
  const privateOpeningHref = buildPrivateOpeningDownload();

  return (
    <main className="page-shell product-shell zk-hub-shell zk-timestamp-shell">
      <div className="background-grid" aria-hidden="true" />

      <header className="frame zk-hub-topbar surface-reveal">
        <div className="zk-hub-topbar-brand">
          <p className="eyebrow zk-hub-topbar-eyebrow">{stamp.shell.eyebrow}</p>
          <Link
            className="zk-hub-topbar-back"
            href={withProductLocale("/timestamp", locale)}
          >
            {stamp.shell.backLabel}
          </Link>
        </div>
        <div className="zk-hub-topbar-tools">
          <ProductLocaleToggle
            locale={locale}
            ariaLabel={stamp.shell.eyebrow}
          />
        </div>
      </header>

      <div className="zk-hub-body">
        <section
          className="frame zk-hub-hero surface-reveal"
          aria-labelledby="zk-timestamp-stamp-title"
        >
          <p className="eyebrow">{stamp.shell.eyebrow}</p>
          <h1 id="zk-timestamp-stamp-title">{stamp.shell.title}</h1>
          <p className="hero-copy zk-hub-hero-body">{stamp.shell.body}</p>
        </section>

        <section
          className="frame zk-hub-section surface-reveal"
          aria-labelledby="zk-timestamp-stamp-form-title"
        >
          <header className="zk-hub-section-header">
            <h2 id="zk-timestamp-stamp-form-title">{stamp.form.submitLabel}</h2>
          </header>

          <form
            className="zk-hub-form"
            onSubmit={onSubmit}
            aria-busy={status === "busy"}
          >
            <label className="zk-hub-form-field">
              <span className="zk-hub-form-label">{stamp.form.fileLabel}</span>
              <span
                className="zk-hub-file-picker"
                data-disabled={String(status === "busy")}
              >
                <input
                  className="zk-hub-file-input"
                  type="file"
                  onChange={onFileChange}
                  disabled={status === "busy"}
                  aria-describedby="zk-timestamp-stamp-file-hint"
                />
                <span className="zk-hub-file-button">
                  {stamp.form.chooseFileLabel}
                </span>
                <span className="zk-hub-file-name">
                  {file?.name ?? stamp.form.fileEmptyLabel}
                </span>
              </span>
              <span
                id="zk-timestamp-stamp-file-hint"
                className="zk-hub-form-hint"
              >
                {stamp.form.fileHint}
              </span>
            </label>

            <div className="button-row zk-hub-hero-actions">
              <button
                type="submit"
                className="button-primary"
                disabled={status === "busy"}
              >
                {status === "busy"
                  ? stamp.form.busyLabel
                  : stamp.form.submitLabel}
              </button>
            </div>
          </form>

          {status === "error" && errorMessage ? (
            <p className="zk-hub-form-error" role="alert">
              {errorMessage}
            </p>
          ) : null}
        </section>

        {result ? (
          <section
            className="frame zk-hub-section surface-reveal"
            aria-labelledby="zk-timestamp-stamp-result-title"
          >
            <header className="zk-hub-section-header">
              <p className="eyebrow">{stamp.result.eyebrow}</p>
              <h2 id="zk-timestamp-stamp-result-title">
                {stamp.result.successTitle}
              </h2>
            </header>

            <dl className="zk-hub-stack-grid">
              <ReceiptRow
                label={stamp.result.commitmentLabel}
                value={`0x${result.publicReceipt.commitment}`}
              />
              <ReceiptRow
                label={stamp.result.blockHeightLabel}
                value={String(result.publicReceipt.block_height)}
              />
              <ReceiptRow
                label={stamp.result.anchorTxidLabel}
                value={`0x${result.anchor.txid}`}
              />
              <ReceiptRow
                label={stamp.result.anchorNetworkLabel}
                value={result.anchor.network}
              />
            </dl>

            <div className="zk-hub-anchor-cost" role="note">
              <span className="zk-hub-anchor-cost-label">
                {stamp.result.anchorCostLabel}
              </span>
              <strong className="zk-hub-anchor-cost-value">
                {stamp.result.anchorCostValue}
              </strong>
              <span className="zk-hub-anchor-cost-note">
                {stamp.result.anchorCostNote}
              </span>
            </div>

            <div className="button-row zk-hub-hero-actions">
              {publicReceiptHref ? (
                <a
                  className="button-primary"
                  href={publicReceiptHref}
                  download="zectime-public-receipt.json"
                >
                  {stamp.result.downloadPublicLabel}
                </a>
              ) : null}
              {privateOpeningHref ? (
                <a
                  className="button-secondary"
                  href={privateOpeningHref}
                  download="zectime-private-opening.json"
                >
                  {stamp.result.downloadPrivateLabel}
                </a>
              ) : null}
              {result.anchor.explorerUrl ? (
                <a
                  className="button-secondary"
                  href={result.anchor.explorerUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  {stamp.result.anchorExplorerLabel}
                </a>
              ) : null}
            </div>

            <p className="zk-hub-hero-note">
              <strong>{stamp.result.nextStepsLabel}: </strong>
              {stamp.result.nextStepsBody}
            </p>
          </section>
        ) : null}
      </div>
    </main>
  );
}

function isMissingAnchorConfig(body: unknown): boolean {
  if (typeof body !== "object" || body === null || !("error" in body)) {
    return false;
  }
  const error = (body as { error?: unknown }).error;
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const kind = (error as { kind?: unknown }).kind;
  const message = (error as { message?: unknown }).message;
  return (
    kind === "cli_unavailable" &&
    typeof message === "string" &&
    /Missing anchor configuration/iu.test(message)
  );
}

interface ReceiptRowProps {
  label: string;
  value: string;
}

function ReceiptRow({ label, value }: ReceiptRowProps) {
  return (
    <div className="zk-hub-stack-block">
      <span className="zk-hub-stack-label">{label}</span>
      <strong className="zk-hub-stack-value" style={{ wordBreak: "break-all" }}>
        <code>{value}</code>
      </strong>
    </div>
  );
}

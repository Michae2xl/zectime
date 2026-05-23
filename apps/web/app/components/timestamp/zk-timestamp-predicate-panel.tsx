"use client";

import Link from "next/link";
import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";

import { withProductLocale } from "../../../lib/locale";
import { extractServerErrorMessage } from "../../../lib/server-error-message";
import type { ProductLocale } from "../../../lib/types";
import {
  ZK_TIMESTAMP_RFC_PATH,
  type ZkTimestampCopy,
} from "../../../lib/zk-timestamp";
import { ProductLocaleToggle } from "../locale/product-locale-toggle";

interface ZkTimestampPredicatePanelProps {
  locale: ProductLocale;
  copy: ZkTimestampCopy;
}

interface PredicatePublicInputs {
  commitment: string;
  blockHeight: number;
  claimHash: string;
}

interface PredicateProofArtifact {
  proofBase64: string;
  proofSizeBytes: number;
  publicInputs: PredicatePublicInputs;
}

interface PredicateProveResponse {
  proof: PredicateProofArtifact;
}

interface PredicateVerifyResponse {
  verification: {
    publicInputs: PredicatePublicInputs;
    matchesReceipt: boolean | null;
  };
}

type Status = "idle" | "busy" | "error" | "success";

const PREDICATE_TREE_DEPTH = 8;

const SAMPLE_WITNESS = {
  doc_root: `0x${"11".repeat(32)}`,
  nonce: `0x${"22".repeat(32)}`,
  block_height: 2_500_000,
  field_index: 0,
  field_value: `0x${"33".repeat(32)}`,
  path_bits: Array.from({ length: PREDICATE_TREE_DEPTH }, () => false),
  siblings: Array.from(
    { length: PREDICATE_TREE_DEPTH },
    (_, i) => `0x${i.toString(16).padStart(64, "0")}`,
  ),
};

export function ZkTimestampPredicatePanel({
  locale,
  copy,
}: ZkTimestampPredicatePanelProps) {
  const predicate = copy.predicate;
  const sampleWitnessText = useMemo(
    () => JSON.stringify(SAMPLE_WITNESS, null, 2),
    [],
  );

  const [witnessJson, setWitnessJson] = useState<string>("");
  const [proveStatus, setProveStatus] = useState<Status>("idle");
  const [proveError, setProveError] = useState<string>("");
  const [proveResult, setProveResult] = useState<PredicateProofArtifact | null>(
    null,
  );
  const [proofCopied, setProofCopied] = useState<boolean>(false);

  const [proofBase64, setProofBase64] = useState<string>("");
  const [receiptJson, setReceiptJson] = useState<string>("");
  const [verifyStatus, setVerifyStatus] = useState<Status>("idle");
  const [verifyError, setVerifyError] = useState<string>("");
  const [verifyResult, setVerifyResult] = useState<
    PredicateVerifyResponse["verification"] | null
  >(null);

  function onWitnessChange(event: ChangeEvent<HTMLTextAreaElement>) {
    setWitnessJson(event.target.value);
    setProofCopied(false);
  }

  function onProofChange(event: ChangeEvent<HTMLTextAreaElement>) {
    setProofBase64(event.target.value);
  }

  function onReceiptChange(event: ChangeEvent<HTMLTextAreaElement>) {
    setReceiptJson(event.target.value);
  }

  function fillSampleWitness() {
    setWitnessJson(sampleWitnessText);
    setProveError("");
    setProveStatus("idle");
  }

  async function onProveSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProveError("");
    setProveResult(null);
    setProofCopied(false);

    const trimmed = witnessJson.trim();
    if (!trimmed) {
      setProveStatus("error");
      setProveError(predicate.prove.errors.missingWitness);
      return;
    }

    try {
      JSON.parse(trimmed);
    } catch {
      setProveStatus("error");
      setProveError(predicate.prove.errors.invalidWitness);
      return;
    }

    setProveStatus("error");
    setProveError(predicate.prove.errors.localOnly);
  }

  async function onVerifySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setVerifyError("");
    setVerifyResult(null);

    const trimmedProof = proofBase64.trim();
    if (!trimmedProof) {
      setVerifyStatus("error");
      setVerifyError(predicate.verify.errors.missingProof);
      return;
    }

    let receiptBody: unknown = null;
    const rawReceipt = receiptJson.trim();
    if (rawReceipt) {
      try {
        receiptBody = JSON.parse(rawReceipt);
      } catch {
        setVerifyStatus("error");
        setVerifyError(predicate.verify.errors.invalidReceipt);
        return;
      }
    }

    setVerifyStatus("busy");
    try {
      const response = await fetch("/api/timestamps/predicate/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proofBase64: trimmedProof,
          receipt: receiptBody,
        }),
      });

      const body = (await response.json()) as unknown;
      if (!response.ok) {
        throw new Error(
          extractServerErrorMessage(body, `HTTP ${response.status}`),
        );
      }

      const verification = (body as PredicateVerifyResponse).verification;
      setVerifyResult(verification);
      setVerifyStatus("success");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setVerifyStatus("error");
      setVerifyError(`${predicate.verify.errors.serverError}${message}`);
    }
  }

  async function onCopyProof() {
    if (!proveResult) return;
    try {
      await navigator.clipboard.writeText(proveResult.proofBase64);
      setProofCopied(true);
    } catch {
      setProofCopied(false);
    }
  }

  const verifyTitle = pickVerifyTitle(verifyResult, predicate);

  return (
    <main className="page-shell product-shell zk-hub-shell zk-timestamp-shell">
      <div className="background-grid" aria-hidden="true" />

      <header className="frame zk-hub-topbar surface-reveal">
        <div className="zk-hub-topbar-brand">
          <p className="eyebrow zk-hub-topbar-eyebrow">
            {predicate.shell.eyebrow}
          </p>
          <Link
            className="zk-hub-topbar-back"
            href={withProductLocale("/timestamp", locale)}
          >
            {predicate.shell.backLabel}
          </Link>
        </div>
        <div className="zk-hub-topbar-tools">
          <a
            className="button-secondary"
            href={ZK_TIMESTAMP_RFC_PATH}
            target="_blank"
            rel="noreferrer noopener"
          >
            {copy.shell.rfcLinkLabel}
          </a>
          <ProductLocaleToggle
            locale={locale}
            ariaLabel={predicate.shell.eyebrow}
          />
        </div>
      </header>

      <div className="zk-hub-body">
        <section
          className="frame zk-hub-hero surface-reveal"
          aria-labelledby="zk-timestamp-predicate-title"
        >
          <p className="eyebrow">{predicate.shell.eyebrow}</p>
          <h1 id="zk-timestamp-predicate-title">{predicate.shell.title}</h1>
          <p className="hero-copy zk-hub-hero-body">{predicate.shell.body}</p>
        </section>

        <section
          className="frame zk-hub-section surface-reveal"
          aria-labelledby="zk-timestamp-predicate-prove-title"
        >
          <header className="zk-hub-section-header">
            <p className="eyebrow">{predicate.intro.proveTitle}</p>
            <h2 id="zk-timestamp-predicate-prove-title">
              {predicate.prove.submitLabel}
            </h2>
            <p className="zk-hub-section-body">{predicate.intro.proveBody}</p>
          </header>

          <form
            className="zk-hub-form"
            onSubmit={onProveSubmit}
            aria-busy={proveStatus === "busy"}
          >
            <label className="zk-hub-form-field">
              <span className="zk-hub-form-label">
                {predicate.prove.witnessLabel}
              </span>
              <textarea
                rows={12}
                value={witnessJson}
                onChange={onWitnessChange}
                disabled={proveStatus === "busy"}
                aria-describedby="zk-timestamp-predicate-witness-hint"
                spellCheck={false}
              />
              <span
                id="zk-timestamp-predicate-witness-hint"
                className="zk-hub-form-hint"
              >
                {predicate.prove.witnessHint}
              </span>
            </label>

            <div className="button-row zk-hub-hero-actions">
              <button
                type="submit"
                className="button-primary"
                disabled={proveStatus === "busy"}
              >
                {proveStatus === "busy"
                  ? predicate.prove.busyLabel
                  : predicate.prove.submitLabel}
              </button>
              <button
                type="button"
                className="button-secondary"
                onClick={fillSampleWitness}
                disabled={proveStatus === "busy"}
              >
                {predicate.prove.sampleLabel}
              </button>
            </div>
          </form>

          {proveStatus === "error" && proveError ? (
            <p className="zk-hub-form-error" role="alert">
              {proveError}
            </p>
          ) : null}

          {proveResult ? (
            <section
              className="frame zk-hub-section surface-reveal"
              aria-labelledby="zk-timestamp-predicate-prove-result-title"
            >
              <header className="zk-hub-section-header">
                <p className="eyebrow">{predicate.prove.result.eyebrow}</p>
                <h3 id="zk-timestamp-predicate-prove-result-title">
                  {predicate.prove.result.title}
                </h3>
              </header>

              <dl className="zk-hub-stack-grid">
                <ResultRow
                  label={predicate.prove.result.sizeLabel}
                  value={`${proveResult.proofSizeBytes} B`}
                />
                <ResultRow
                  label={predicate.prove.result.commitmentLabel}
                  value={`0x${proveResult.publicInputs.commitment}`}
                />
                <ResultRow
                  label={predicate.prove.result.blockHeightLabel}
                  value={String(proveResult.publicInputs.blockHeight)}
                />
                <ResultRow
                  label={predicate.prove.result.claimHashLabel}
                  value={`0x${proveResult.publicInputs.claimHash}`}
                />
              </dl>

              <div className="zk-hub-form-field">
                <span className="zk-hub-form-label">
                  {predicate.prove.result.proofLabel}
                </span>
                <textarea
                  rows={6}
                  value={proveResult.proofBase64}
                  readOnly
                  spellCheck={false}
                />
                <span className="zk-hub-form-hint">
                  {predicate.prove.result.proofHint}
                </span>
              </div>

              <div className="button-row">
                <button
                  type="button"
                  className="button-secondary"
                  onClick={onCopyProof}
                >
                  {proofCopied
                    ? predicate.prove.result.copiedLabel
                    : predicate.prove.result.copyLabel}
                </button>
              </div>
            </section>
          ) : null}
        </section>

        <section
          className="frame zk-hub-section surface-reveal"
          aria-labelledby="zk-timestamp-predicate-verify-title"
        >
          <header className="zk-hub-section-header">
            <p className="eyebrow">{predicate.intro.verifyTitle}</p>
            <h2 id="zk-timestamp-predicate-verify-title">
              {predicate.verify.submitLabel}
            </h2>
            <p className="zk-hub-section-body">{predicate.intro.verifyBody}</p>
          </header>

          <form
            className="zk-hub-form"
            onSubmit={onVerifySubmit}
            aria-busy={verifyStatus === "busy"}
          >
            <label className="zk-hub-form-field">
              <span className="zk-hub-form-label">
                {predicate.verify.proofLabel}
              </span>
              <textarea
                rows={6}
                value={proofBase64}
                onChange={onProofChange}
                disabled={verifyStatus === "busy"}
                aria-describedby="zk-timestamp-predicate-proof-hint"
                spellCheck={false}
              />
              <span
                id="zk-timestamp-predicate-proof-hint"
                className="zk-hub-form-hint"
              >
                {predicate.verify.proofHint}
              </span>
            </label>

            <label className="zk-hub-form-field">
              <span className="zk-hub-form-label">
                {predicate.verify.receiptLabel}
              </span>
              <textarea
                rows={6}
                value={receiptJson}
                onChange={onReceiptChange}
                disabled={verifyStatus === "busy"}
                aria-describedby="zk-timestamp-predicate-receipt-hint"
                spellCheck={false}
              />
              <span
                id="zk-timestamp-predicate-receipt-hint"
                className="zk-hub-form-hint"
              >
                {predicate.verify.receiptHint}
              </span>
            </label>

            <div className="button-row zk-hub-hero-actions">
              <button
                type="submit"
                className="button-primary"
                disabled={verifyStatus === "busy"}
              >
                {verifyStatus === "busy"
                  ? predicate.verify.busyLabel
                  : predicate.verify.submitLabel}
              </button>
            </div>
          </form>

          {verifyStatus === "error" && verifyError ? (
            <p className="zk-hub-form-error" role="alert">
              {verifyError}
            </p>
          ) : null}

          {verifyResult ? (
            <section
              className="frame zk-hub-section surface-reveal"
              aria-labelledby="zk-timestamp-predicate-verify-result-title"
              data-match={String(verifyResult.matchesReceipt)}
            >
              <header className="zk-hub-section-header">
                <p className="eyebrow">{predicate.verify.result.eyebrow}</p>
                <h3 id="zk-timestamp-predicate-verify-result-title">
                  {verifyTitle}
                </h3>
              </header>

              <dl className="zk-hub-stack-grid">
                <ResultRow
                  label={predicate.verify.result.commitmentLabel}
                  value={`0x${verifyResult.publicInputs.commitment}`}
                />
                <ResultRow
                  label={predicate.verify.result.blockHeightLabel}
                  value={String(verifyResult.publicInputs.blockHeight)}
                />
                <ResultRow
                  label={predicate.verify.result.claimHashLabel}
                  value={`0x${verifyResult.publicInputs.claimHash}`}
                />
                <ResultRow
                  label={predicate.verify.result.matchStatusLabel}
                  value={pickMatchLabel(verifyResult.matchesReceipt, predicate)}
                />
              </dl>
            </section>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function pickVerifyTitle(
  verification: PredicateVerifyResponse["verification"] | null,
  predicate: ZkTimestampCopy["predicate"],
): string {
  if (!verification) {
    return "";
  }
  if (verification.matchesReceipt === true) {
    return predicate.verify.result.matchTitle;
  }
  if (verification.matchesReceipt === false) {
    return predicate.verify.result.mismatchTitle;
  }
  return predicate.verify.result.noReceiptTitle;
}

function pickMatchLabel(
  matchesReceipt: boolean | null,
  predicate: ZkTimestampCopy["predicate"],
): string {
  if (matchesReceipt === true) return predicate.verify.result.matchLabel;
  if (matchesReceipt === false) return predicate.verify.result.mismatchLabel;
  return predicate.verify.result.noReceiptLabel;
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

import {
  IconAlertTriangle,
  IconCircleCheck,
  IconDownload,
  IconShieldCheck,
} from "@tabler/icons-react";

import type { AloraBundle, VerificationResult } from "./types";
import { Badge, Button, HashValue, KeyValue, Panel } from "./ui";

function shortCheckId(id: string) {
  const [kind, suffix] = id.split(":");
  return suffix ? `${kind}:${suffix.slice(0, 8)}` : id;
}

function checkTone(status: string) {
  if (status === "pass") return "ok" as const;
  if (status === "fail") return "danger" as const;
  return "warn" as const;
}

export function EvidenceTab({
  bundle,
  verification,
  busy,
  onVerifyChain,
  onExport,
}: {
  bundle: AloraBundle;
  verification: VerificationResult | null;
  busy: string | null;
  onVerifyChain: () => Promise<unknown>;
  onExport: () => Promise<unknown>;
}) {
  const checks = bundle.lastVerification?.checks ?? [];
  const passCount = checks.filter((check) => check.status === "pass").length;
  const failCount = checks.filter((check) => check.status === "fail").length;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(330px,0.9fr)]">
      <div className="grid min-w-0 gap-4">
        <Panel
          title="Ledger"
          right={
            <div className="flex gap-2">
              <Button
                busy={busy === "chain"}
                disabled={Boolean(busy) && busy !== "chain"}
                onClick={() => void onVerifyChain()}
              >
                <IconShieldCheck size={14} /> Recompute chain
              </Button>
              <Button
                variant="primary"
                busy={busy === "export"}
                onClick={() => void onExport()}
              >
                <IconDownload size={14} /> Export manifest
              </Button>
            </div>
          }
          tone={
            (verification && !verification.valid) || !bundle.chain.valid
              ? "danger"
              : "ok"
          }
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <div className="alora-label">Chain</div>
              <div className="mt-1 flex items-center gap-2">
                {bundle.chain.valid ? (
                  <IconCircleCheck
                    size={16}
                    className="text-[var(--alora-ok)]"
                  />
                ) : (
                  <IconAlertTriangle
                    size={16}
                    className="text-[var(--alora-danger)]"
                  />
                )}
                <span className="alora-mono text-[13px]">
                  {bundle.chain.valid ? "Valid" : "Broken"}
                </span>
              </div>
              <div className="mt-1 text-[11px] text-[var(--alora-muted)]">
                {bundle.chain.entries} entries
              </div>
            </div>
            <div>
              <div className="alora-label">Tip hash</div>
              <div className="mt-2">
                <HashValue value={bundle.chain.tipHash} chars={18} />
              </div>
            </div>
            <div>
              <div className="alora-label">Last recompute</div>
              <div className="mt-2">
                {verification ? (
                  <Badge
                    tone={
                      !verification.hasActiveDocument
                        ? "neutral"
                        : verification.valid
                          ? verification.historicalMismatches
                            ? "warn"
                            : "ok"
                          : "danger"
                    }
                  >
                    {!verification.hasActiveDocument
                      ? "No active document"
                      : verification.valid
                        ? verification.allHashesMatch
                          ? "All hashes match"
                          : "Current artifact matches"
                        : "Mismatch found"}
                  </Badge>
                ) : (
                  <span className="text-[12px] text-[var(--alora-muted)]">
                    Not recomputed
                  </span>
                )}
              </div>
            </div>
          </div>

          {verification ? (
            <div className="mt-4 grid gap-2">
              {verification.historicalMismatches > 0 ? (
                <p className="text-[12px] text-[var(--alora-warn)]">
                  {verification.historicalMismatches} historical mismatches
                  preserved.
                </p>
              ) : null}
              {verification.deliverables.map((deliverable) => (
                <div
                  key={deliverable.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded border border-[var(--alora-line)] bg-[var(--alora-bg)] px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="alora-mono truncate text-[12px]">
                      {deliverable.filename}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-3">
                      <HashValue
                        label="Stored"
                        value={deliverable.storedHash}
                        chars={12}
                      />
                      <HashValue
                        label="Recomputed"
                        value={deliverable.recomputedHash}
                        chars={12}
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Badge tone="neutral">{deliverable.state}</Badge>
                    <Badge
                      tone={
                        deliverable.hashMatches && deliverable.submissionMatches
                          ? "ok"
                          : "danger"
                      }
                    >
                      {deliverable.hashMatches && deliverable.submissionMatches
                        ? "Matches"
                        : "Mismatch"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </Panel>

        <Panel
          title={
            bundle.lastVerification
              ? `${passCount} passed · ${failCount} failed`
              : "No verification run"
          }
          right={
            <Badge
              tone={
                bundle.integrity.verificationCurrent
                  ? "ok"
                  : bundle.lastVerification?.status === "rejected"
                    ? "danger"
                    : "warn"
              }
            >
              {bundle.lastVerification?.status === "verified" &&
              !bundle.integrity.verificationCurrent
                ? "Needs verification"
                : (bundle.lastVerification?.status ?? "Not run")}
            </Badge>
          }
        >
          <div className="grid gap-1">
            {checks.map((check) => (
              <div
                key={check.id}
                className="grid grid-cols-[16px_minmax(0,1fr)] gap-2 border-b border-[var(--alora-line)] py-2 last:border-b-0"
              >
                <div className="pt-[3px]">
                  {check.status === "pass" ? (
                    <IconCircleCheck
                      size={13}
                      className="text-[var(--alora-ok)]"
                    />
                  ) : check.status === "fail" ? (
                    <IconAlertTriangle
                      size={13}
                      className="text-[var(--alora-danger)]"
                    />
                  ) : (
                    <IconAlertTriangle
                      size={13}
                      className="text-[var(--alora-warn)]"
                    />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="alora-mono text-[12px]" title={check.id}>
                      {shortCheckId(check.id)}
                    </span>
                    <span className="min-w-0 text-[12px] text-[var(--alora-muted)]">
                      {check.label}
                    </span>
                    {check.status !== "pass" ? (
                      <Badge tone={checkTone(check.status)}>
                        {check.status}
                      </Badge>
                    ) : null}
                  </div>
                  {check.status !== "pass" ? (
                    <>
                      <div className="mt-1 text-[11px] leading-relaxed text-[var(--alora-muted)]">
                        {check.detail}
                      </div>
                      <div className="alora-mono mt-1 text-[11px] text-[var(--alora-warn)]">
                        Expected {String(check.expected)} · actual{" "}
                        {String(check.actual)}
                      </div>
                    </>
                  ) : null}
                </div>
              </div>
            ))}
            {checks.length === 0 ? (
              <p className="text-[12px] text-[var(--alora-muted)]">
                Not verified yet.
              </p>
            ) : null}
          </div>
        </Panel>
      </div>

      <div className="grid min-w-0 content-start gap-4">
        <Panel
          title="Approvals"
          right={<Badge tone="accent">{bundle.claim?.status ?? "none"}</Badge>}
        >
          <div className="space-y-1">
            <KeyValue label="Claim" mono>
              <HashValue value={bundle.claim?.id} chars={8} />
            </KeyValue>
            <KeyValue label="Agent">{bundle.claim?.agentId ?? "—"}</KeyValue>
            <KeyValue label="Confidence">
              {bundle.claim?.confidence !== null &&
              bundle.claim?.confidence !== undefined
                ? `${Math.round(bundle.claim.confidence * 100)}%`
                : "—"}
            </KeyValue>
            {bundle.approvals.map((approval) => (
              <div
                key={approval.id}
                className="border-t border-[var(--alora-line)] py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <Badge
                    tone={
                      approval.revoked
                        ? "danger"
                        : bundle.activeApproval?.id === approval.id
                          ? "ok"
                          : "warn"
                    }
                  >
                    {approval.revoked
                      ? "Revoked"
                      : bundle.activeApproval?.id === approval.id
                        ? "Active"
                        : "Needs verification"}
                  </Badge>
                  <span className="text-[11px] text-[var(--alora-muted)]">
                    {approval.approverId}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <HashValue value={approval.approvedSha256} chars={24} />
                  {approval.tariffBaseLevelAcknowledged ? (
                    <Badge tone="warn">Base level acknowledged</Badge>
                  ) : null}
                </div>
                {approval.tariffBaseLevelCodes ? (
                  <div className="alora-mono mt-1 text-[11px] text-[var(--alora-warn)]">
                    Unconfirmed suffix: {approval.tariffBaseLevelCodes}
                  </div>
                ) : null}
                {approval.revokedReason ? (
                  <div className="mt-1 text-[11px] text-[var(--alora-danger)]">
                    {approval.revokedReason}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Evidence log">
          <div className="grid gap-2">
            {bundle.evidence.slice(0, 12).map((entry) => (
              <div
                key={entry.id}
                className="border-l border-[var(--alora-line-strong)] pl-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="alora-mono text-[11px] text-[var(--alora-muted)]">
                    {entry.kind}
                  </span>
                  <span className="text-[11px] text-[var(--alora-muted)]">
                    {new Date(entry.createdAt).toLocaleString()}
                  </span>
                </div>
                <div className="mt-1 text-[12px] leading-relaxed">
                  {entry.summary}
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel
          title="Tariff sources"
          right={<Badge tone="accent">{bundle.tariffs.length} rows</Badge>}
        >
          <div className="grid gap-3">
            {(bundle.document?.tariffVector ?? []).map((row) => (
              <div
                key={`${row.hsCode}-${row.sourceVersion}`}
                className="min-w-0"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="alora-mono text-[12px]">{row.hsCode}</span>
                  <Badge
                    tone={row.nationalSuffixUnconfirmed ? "warn" : "neutral"}
                  >
                    {row.codeLevel}
                  </Badge>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--alora-muted)]">
                  <span>
                    {row.source} · {row.sourceVersion}
                  </span>
                  <a
                    href={row.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    title={row.sourceUrl}
                    className="text-[var(--alora-accent)] underline decoration-dotted"
                  >
                    Source
                  </a>
                </div>
                {row.nationalSuffixUnconfirmed ? (
                  <div className="mt-1 text-[11px] text-[var(--alora-warn)]">
                    National suffix unconfirmed
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          <details className="mt-4">
            <summary className="alora-label cursor-pointer">Advanced</summary>
            <pre className="alora-mono mt-2 max-h-72 overflow-auto rounded bg-[var(--alora-bg)] p-3 text-[11px] leading-relaxed">
              {JSON.stringify(bundle.document, null, 2)}
            </pre>
          </details>
        </Panel>
      </div>
    </div>
  );
}

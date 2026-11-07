import {
  IconAlertTriangle,
  IconCircleCheck,
  IconFingerprint,
  IconRefresh,
  IconShieldLock,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";

import type { AloraBundle } from "./types";
import {
  Badge,
  Button,
  formatMoney,
  HashValue,
  KeyValue,
  Panel,
  Stat,
} from "./ui";

export interface CanvasActions {
  runMission: () => Promise<unknown>;
  repair: () => Promise<unknown>;
  verify: () => Promise<unknown>;
  approve: (acknowledgeTariffBaseLevel: boolean) => Promise<unknown>;
  tamper: () => Promise<unknown>;
  fork: (destination: "DE" | "US" | "AE") => Promise<unknown>;
  selfHeal: (apply: boolean) => Promise<unknown>;
}

export function CanvasTab({
  bundle,
  actions,
  busy,
  canApprove,
}: {
  bundle: AloraBundle;
  actions: CanvasActions;
  busy: string | null;
  canApprove: boolean;
}) {
  const { shipment, document, activeDeliverable, activeApproval, claim } =
    bundle;
  const currency = shipment.currency;
  const failed =
    bundle.lastVerification?.checks.filter(
      (check) => check.status === "fail",
    ) ?? [];
  const warning = bundle.lastVerification?.checks.find(
    (check) => check.status === "warn",
  );
  const approvalBlocked =
    !activeDeliverable ||
    claim?.status !== "verified" ||
    !bundle.integrity.verificationCurrent ||
    !bundle.tariffRequirements.resolved;
  const baseLevelCodes = bundle.tariffRequirements.unconfirmedCodes;
  const [baseLevelAcknowledged, setBaseLevelAcknowledged] = useState(false);

  useEffect(() => {
    setBaseLevelAcknowledged(false);
  }, [
    shipment.id,
    activeDeliverable?.id,
    bundle.snapshot.actualHash,
    bundle.snapshot.inputsHash,
  ]);
  const tariffVersions = Array.from(
    new Set(
      (claim?.tariffVersion ?? "")
        .split("|")
        .map((part) => part.split(":")[1])
        .filter(Boolean),
    ),
  ).join(", ");
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.85fr)]">
      <div className="grid min-w-0 gap-4">
        <Panel
          title="Customs package"
          right={
            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                busy={busy === "mission"}
                onClick={() => void actions.runMission()}
              >
                Run mission
              </Button>
              <Button
                busy={busy === "verify"}
                onClick={() => void actions.verify()}
                disabled={!activeDeliverable}
              >
                Verify
              </Button>
            </div>
          }
          tone={
            bundle.risk === "red"
              ? "danger"
              : bundle.risk === "green"
                ? "ok"
                : "neutral"
          }
        >
          <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-4 md:grid-cols-[repeat(4,minmax(0,1fr))]">
            <Stat
              label="Goods value"
              value={formatMoney(document?.totals.goodsValue, currency)}
              hint={`${bundle.items.length} lines · ${bundle.items.reduce((sum, item) => sum + item.quantity, 0)} units`}
            />
            <Stat
              label="Customs value"
              value={formatMoney(document?.totals.customsValue, currency)}
            />
            <Stat
              label="Duty and VAT"
              value={formatMoney(
                document ? document.totals.duty + document.totals.vat : null,
                currency,
              )}
              hint={`Duty ${formatMoney(document?.totals.duty, currency)} · VAT ${formatMoney(document?.totals.vat, currency)}`}
              tone={failed.length > 0 ? "danger" : "ok"}
            />
            <Stat
              label="Landed cost"
              value={formatMoney(document?.totals.landedCost, currency)}
              tone="accent"
            />
          </div>

          <div className="mt-5 min-w-0 overflow-x-auto">
            <table className="alora-table">
              <thead>
                <tr>
                  <th className="min-w-[168px]">Line item</th>
                  <th>HS code</th>
                  <th className="text-right">Qty</th>
                  <th className="text-right">Unit</th>
                  <th className="text-right">Customs</th>
                  <th className="text-right">Duty</th>
                  <th className="text-right">VAT</th>
                </tr>
              </thead>
              <tbody>
                {bundle.items.map((item, index) => {
                  const line = document?.lines[index];
                  return (
                    <tr key={item.id}>
                      <td>
                        <div className="font-medium">{item.description}</div>
                        <div className="mt-1 text-[11px] text-[var(--alora-muted)]">
                          Origin {item.countryOfOrigin} ·{" "}
                          {item.weightKg * item.quantity} kg
                        </div>
                      </td>
                      <td>
                        <div className="alora-mono text-[12px]">
                          {line?.hsCode ?? item.hsCode ?? "Unclassified"}
                        </div>
                        <div className="mt-1 flex items-center gap-1">
                          <Badge
                            tone={
                              (item.hsConfidence ?? 0) >= 0.85 ? "ok" : "warn"
                            }
                          >
                            {Math.round((item.hsConfidence ?? 0) * 100)}%
                          </Badge>
                          <span className="text-[11px] text-[var(--alora-muted)]">
                            Proposed
                          </span>
                        </div>
                      </td>
                      <td className="alora-mono text-right">{item.quantity}</td>
                      <td className="alora-mono text-right">
                        {formatMoney(item.unitValue, currency)}
                      </td>
                      <td className="alora-mono text-right">
                        {formatMoney(line?.customsValue, currency)}
                      </td>
                      <td className="alora-mono text-right">
                        {formatMoney(line?.duty, currency)}
                      </td>
                      <td className="alora-mono text-right">
                        {formatMoney(line?.vat, currency)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 border-t border-[var(--alora-line)] pt-3">
            <div className="alora-label">Classification</div>
            <p className="mt-1 max-w-3xl text-[12px] leading-relaxed text-[var(--alora-muted)]">
              {document?.classification.rationale ?? "Not classified yet."}
            </p>
          </div>

          {failed.length > 0 ? (
            <div className="alora-notice alora-notice-danger mt-4 items-start">
              <IconAlertTriangle
                size={15}
                className="mt-[2px] text-[var(--alora-danger)]"
              />
              <div className="min-w-0">
                <div className="text-[13px] font-medium">Checks failed</div>
                <ul className="mt-2 grid gap-1">
                  {failed.map((check) => (
                    <li key={check.id} className="alora-mono text-[12px]">
                      {check.id} · expected {String(check.expected)} · actual{" "}
                      {String(check.actual)}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}

          {warning ? (
            <div className="alora-notice alora-notice-warn mt-4">
              <IconAlertTriangle
                size={15}
                className="text-[var(--alora-warn)]"
              />
              <span className="text-[12px]">
                <span className="alora-mono">{warning.id}</span> ·{" "}
                {warning.detail}
              </span>
            </div>
          ) : null}
        </Panel>

        <Panel
          title="Actions"
          right={
            <Badge tone={claim?.status === "human-approved" ? "ok" : "warn"}>
              Claim {claim?.status ?? "none"}
            </Badge>
          }
        >
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            <Button
              busy={busy === "repair"}
              onClick={() => void actions.repair()}
            >
              <IconRefresh size={14} /> Repair package
            </Button>
            <Button
              busy={busy === "self-heal"}
              onClick={() => void actions.selfHeal(false)}
            >
              <IconShieldLock size={14} /> Preview self-heal
            </Button>
            <Button
              busy={busy === "verify"}
              onClick={() => void actions.verify()}
            >
              <IconFingerprint size={14} /> Verify hashes
            </Button>
            <Button
              variant="primary"
              busy={busy === "approve"}
              onClick={() => void actions.approve(baseLevelAcknowledged)}
              disabled={
                approvalBlocked ||
                !canApprove ||
                (baseLevelCodes.length > 0 && !baseLevelAcknowledged)
              }
            >
              <IconCircleCheck size={14} /> Approve hash
            </Button>
            <div className="flex flex-wrap gap-2">
              {(["US", "AE"] as const).map((destination) => (
                <Button
                  key={destination}
                  busy={busy === `fork-${destination}`}
                  onClick={() => void actions.fork(destination)}
                >
                  Fork to {destination}
                </Button>
              ))}
            </div>
          </div>
          {baseLevelCodes.length > 0 ? (
            <label className="mt-3 flex items-start gap-2 rounded border border-[#6a4a2a] bg-[var(--alora-bg)] px-3 py-2 text-[11px] leading-relaxed text-[var(--alora-muted)]">
              <input
                type="checkbox"
                checked={baseLevelAcknowledged}
                onChange={(event) =>
                  setBaseLevelAcknowledged(event.target.checked)
                }
                className="mt-[2px] accent-[var(--alora-warn)]"
              />
              <span>
                National suffix unconfirmed for{" "}
                <span className="alora-mono text-[var(--alora-warn)]">
                  {baseLevelCodes.join(", ")}
                </span>
                . Approve at the stored 8-digit GCC/HS level.
              </span>
            </label>
          ) : null}
        </Panel>
        <details className="rounded-lg border border-[var(--alora-line)] bg-[var(--alora-surface)] px-4 py-2">
          <summary className="cursor-pointer py-3 text-[12px] text-[var(--alora-muted)]">Demo testing</summary>
          <p className="mb-3 max-w-[60ch] text-[12px] leading-relaxed text-[var(--alora-muted)]">
            Simulate a document change to test integrity checks. This changes the selected package and revokes its verification and approval.
          </p>
          <Button variant="danger" busy={busy === "tamper"} onClick={() => void actions.tamper()} disabled={!activeDeliverable}>
            <IconAlertTriangle size={14} /> Simulate document tampering
          </Button>
        </details>
      </div>

      <div className="grid min-w-0 content-start gap-4">
        <Panel
          title="Deliverable"
          right={
            <Badge
              tone={
                !bundle.integrity.hasDeliverable
                  ? "neutral"
                  : bundle.integrity.hashMatches
                    ? "ok"
                    : "danger"
              }
            >
              {!bundle.integrity.hasDeliverable
                ? "Not submitted"
                : bundle.integrity.hashMatches
                  ? "Hash ok"
                  : "Hash mismatch"}
            </Badge>
          }
          tone={
            !bundle.integrity.hasDeliverable
              ? "neutral"
              : bundle.integrity.hashMatches
                ? "ok"
                : "danger"
          }
        >
          <div className="space-y-2">
            <KeyValue label="Version">
              v{activeDeliverable?.version ?? "—"} ·{" "}
              {activeDeliverable?.byteLength ?? 0} bytes
            </KeyValue>
            <KeyValue label="File">
              {activeDeliverable?.filename ?? "—"}
            </KeyValue>
            <KeyValue label="SHA-256" mono>
              <HashValue value={activeDeliverable?.sha256} chars={28} />
            </KeyValue>
            <KeyValue label="Inputs hash" mono>
              <HashValue value={claim?.inputsHash} chars={20} />
            </KeyValue>
            <KeyValue label="Tariff set" mono>
              {claim?.tariffVersion ? (
                <span
                  className="text-[11px] text-[var(--alora-muted)]"
                  title={claim.tariffVersion}
                >
                  {tariffVersions || "—"}
                </span>
              ) : (
                "—"
              )}
            </KeyValue>
            <KeyValue label="Approved hash" mono>
              <HashValue value={activeApproval?.approvedSha256} chars={20} />
            </KeyValue>
            <KeyValue label="Approver">
              {activeApproval
                ? `${activeApproval.approverId} · ${activeApproval.approverKind}`
                : "Not approved"}
            </KeyValue>
            <KeyValue label="Verification">
              {bundle.lastVerification ? (
                <Badge
                  tone={
                    bundle.lastVerification.status === "verified"
                      ? "ok"
                      : "danger"
                  }
                >
                  {bundle.lastVerification.status}
                </Badge>
              ) : (
                "Not run"
              )}
            </KeyValue>
          </div>
        </Panel>

        <Panel
          title={`${shipment.destination} tariff`}
          right={<Badge tone="accent">{bundle.tariffs.length} rows</Badge>}
        >
          <div className="grid gap-3">
            {bundle.tariffs.map((row) => (
              <div
                key={row.id}
                className="border-b border-[var(--alora-line)] pb-3 last:border-b-0 last:pb-0"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="alora-mono text-[12px]">{row.hsCode}</span>
                  <span className="alora-mono text-[11px] text-[var(--alora-muted)]">
                    Duty {(row.dutyRate * 100).toFixed(1)}% · VAT{" "}
                    {((row.vatRate ?? 0) * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="mt-1 text-[12px]">{row.description}</div>
                <div className="mt-1 text-[11px] text-[var(--alora-muted)]">
                  {row.source} · {row.sourceVersion} · fetched {row.fetchedAt}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Badge
                    tone={row.nationalSuffixUnconfirmed ? "warn" : "neutral"}
                  >
                    {row.codeLevel}
                  </Badge>
                  {row.nationalSuffixUnconfirmed ? (
                    <span className="text-[11px] text-[var(--alora-warn)]">
                      National suffix unconfirmed
                    </span>
                  ) : null}
                  <a
                    href={row.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    title={row.sourceUrl}
                    className="text-[11px] text-[var(--alora-accent)] underline decoration-dotted"
                  >
                    Source
                  </a>
                </div>
              </div>
            ))}
            <p className="text-[11px] text-[var(--alora-warn)]">
              Estimate, not legal advice.
            </p>
          </div>
        </Panel>
      </div>
    </div>
  );
}

import {
  actionErrorMessage,
  useActionMutation,
} from "@agent-native/core/client/hooks";
import {
  IconCheck,
  IconSend,
  IconSparkles,
  IconWand,
} from "@tabler/icons-react";
import { useState } from "react";
import { toast } from "sonner";

import type {
  AloraBundle,
  DemoResult,
  IntakeResult,
  SelfHealResult,
  SurgeResult,
} from "./types";
import { Badge, Button, HashValue, Panel } from "./ui";

const SAMPLE_INTAKE =
  "2 x Industrial network router, model AR-9 @ 210\n10 x Cotton T-shirts, printed @ 12.5";

export function ExtensionsTab({
  bundle,
  onOpenShipment,
  operatorEmail,
}: {
  bundle: AloraBundle;
  onOpenShipment: (shipmentId: string) => void;
  operatorEmail: string | null;
}) {
  const shipmentId = bundle.shipment.id;
  const [intakeText, setIntakeText] = useState(SAMPLE_INTAKE);
  const [intake, setIntake] = useState<IntakeResult | null>(null);
  const [heal, setHeal] = useState<SelfHealResult | null>(null);
  const [surge, setSurge] = useState<SurgeResult | null>(null);
  const [workers, setWorkers] = useState(4);
  const [courier, setCourier] = useState("DHL Express");
  const [label, setLabel] = useState("شحنة ALO-2026-001 · 12 صناديق");
  const [labelResult, setLabelResult] = useState<{
    ok: boolean;
    checks: string[];
    labelHash: string;
  } | null>(null);
  const [demo, setDemo] = useState<DemoResult | null>(null);

  const intakeAction = useActionMutation("intake-shipment");
  const selfHealAction = useActionMutation("self-heal-document");
  const surgeAction = useActionMutation("surge-verify");
  const draftAction = useActionMutation("draft-courier-email");
  const approveDraftAction = useActionMutation("approve-courier-draft");
  const sendDraftAction = useActionMutation("send-courier-email");
  const proposeAction = useActionMutation("propose-action");
  const reviewProposalAction = useActionMutation("review-proposed-action");
  const approveProposalAction = useActionMutation("approve-proposed-action");
  const labelAction = useActionMutation("check-arabic-label");
  const demoAction = useActionMutation("generate-demo");

  const fail = (error: unknown, fallback: string) =>
    toast.error(actionErrorMessage(error) ?? fallback);

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Panel title="Intake" right={<Badge tone="accent">Deterministic</Badge>}>
        <textarea
          value={intakeText}
          onChange={(event) => setIntakeText(event.target.value)}
          rows={4}
          className="alora-input"
          aria-label="Packing list text"
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            busy={intakeAction.isPending}
            onClick={() =>
              intakeAction.mutate(
                {
                  text: intakeText,
                  destination: "DE",
                  currency: "EUR",
                  shippingCost: 0,
                  insuranceCost: 0,
                  confirm: false,
                },
                {
                  onSuccess: (result) => setIntake(result as IntakeResult),
                  onError: (error) => fail(error, "Parse failed."),
                },
              )
            }
          >
            Extract draft
          </Button>
          <Button
            variant="primary"
            busy={intakeAction.isPending}
            onClick={() =>
              intakeAction.mutate(
                {
                  text: intakeText,
                  destination: "DE",
                  currency: "EUR",
                  shippingCost: 120,
                  insuranceCost: 20,
                  confirm: true,
                },
                {
                  onSuccess: (result) => {
                    const typed = result as IntakeResult;
                    setIntake(typed);
                    if (typed.shipmentId) onOpenShipment(typed.shipmentId);
                  },
                  onError: (error) => fail(error, "Create failed."),
                },
              )
            }
          >
            Create shipment
          </Button>
        </div>
        {intake ? (
          <div className="mt-3 grid gap-2">
            {intake.draft.items.map((item, index) => (
              <div
                key={`${item.description}-${index}`}
                className="rounded border border-[var(--alora-line)] px-2 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px]">{item.description}</span>
                  <Badge tone="warn">
                    HS {item.hsCode ?? "unclassified"} ·{" "}
                    {Math.round(item.hsConfidence * 100)}%
                  </Badge>
                </div>
                <div className="alora-mono mt-1 text-[11px] text-[var(--alora-muted)]">
                  {item.quantity} × {item.unitValue}
                </div>
              </div>
            ))}
            {intake.draft.unparsedLines.length > 0 ? (
              <div className="text-[11px] text-[var(--alora-danger)]">
                Unparsed: {intake.draft.unparsedLines.join(" · ")}
              </div>
            ) : null}
            {intake.reference ? (
              <Button onClick={() => onOpenShipment(intake.shipmentId ?? "")}>
                Open {intake.reference}
              </Button>
            ) : null}
          </div>
        ) : null}
      </Panel>

      <Panel
        title="Self-heal"
        right={
          heal ? (
            <Badge tone={heal.confidence < 1 ? "warn" : "ok"}>
              {Math.round(heal.confidence * 100)}% match
            </Badge>
          ) : null
        }
      >
        <div className="flex flex-wrap gap-2">
          <Button
            busy={selfHealAction.isPending}
            onClick={() =>
              selfHealAction.mutate(
                { shipmentId, apply: false },
                {
                  onSuccess: (result) => setHeal(result as SelfHealResult),
                  onError: (error) => fail(error, "Preview failed."),
                },
              )
            }
          >
            <IconWand size={14} /> Inspect fields
          </Button>
          <Button
            variant="primary"
            busy={selfHealAction.isPending}
            onClick={() =>
              selfHealAction.mutate(
                { shipmentId, apply: true },
                {
                  onSuccess: (result) => {
                    setHeal(result as SelfHealResult);
                    toast.success("Patch applied. Approval revoked.");
                  },
                  onError: (error) => fail(error, "Self-heal failed"),
                },
              )
            }
          >
            Apply patch
          </Button>
        </div>
        {heal ? (
          <div className="mt-3 grid gap-2">
            <div className="h-1 w-full rounded bg-[var(--alora-line)]">
              <div
                className="h-full rounded bg-[var(--alora-ok)] transition-[width] duration-150"
                style={{ width: `${heal.confidence * 100}%` }}
              />
            </div>
            {heal.patches.length === 0 ? (
              <p className="text-[12px] text-[var(--alora-ok)]">
                No field patches needed.
              </p>
            ) : (
              heal.patches.map((patch) => (
                <div
                  key={patch.field}
                  className="rounded border border-[#6a3a42] px-2 py-2"
                >
                  <div className="alora-mono text-[11px] text-[var(--alora-danger)]">
                    {patch.field}
                  </div>
                  <div className="mt-1 text-[12px]">{patch.problem}</div>
                  <div className="mt-1 text-[11px] text-[var(--alora-muted)]">
                    {patch.patch}
                  </div>
                </div>
              ))
            )}
            {heal.applied ? (
              <div className="rounded border border-[#2f5b46] px-2 py-2 text-[11px] text-[var(--alora-ok)]">
                Version v{heal.applied.version} ·{" "}
                {heal.applied.previousApprovalsRevoked}{" "}
                {heal.applied.previousApprovalsRevoked === 1
                  ? "approval"
                  : "approvals"}{" "}
                revoked
                <div className="mt-1">
                  <HashValue value={heal.applied.sha256} chars={24} />
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </Panel>

      <Panel
        title="Checkers"
        right={
          <Badge tone="accent">
            ${surge ? surge.costUsd.toFixed(2) : "0.00"} cost
          </Badge>
        }
      >
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={1}
            max={8}
            value={workers}
            onChange={(event) => setWorkers(Number(event.target.value))}
            className="w-full accent-[var(--alora-accent)]"
            aria-label="Worker count"
          />
          <span className="alora-mono w-12 text-right text-[13px]">
            {workers}×
          </span>
        </div>
        <Button
          className="mt-2"
          busy={surgeAction.isPending}
          onClick={() =>
            surgeAction.mutate(
              { shipmentId, workers },
              {
                onSuccess: (result) => setSurge(result as SurgeResult),
                onError: (error) => fail(error, "Run failed."),
              },
            )
          }
        >
          Launch checkers
        </Button>
        {surge ? (
          <div className="mt-3 grid gap-2">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded border border-[var(--alora-line)] p-2">
                <div className="alora-label">Lines</div>
                <div className="alora-mono text-[13px]">{surge.totalLines}</div>
              </div>
              <div className="rounded border border-[var(--alora-line)] p-2">
                <div className="alora-label">Passed</div>
                <div className="alora-mono text-[13px] text-[var(--alora-ok)]">
                  {surge.passed}
                </div>
              </div>
              <div className="rounded border border-[var(--alora-line)] p-2">
                <div className="alora-label">Elapsed</div>
                <div className="alora-mono text-[13px]">
                  {surge.durationMs}ms
                </div>
              </div>
            </div>
            {surge.partitions.map((partition) => (
              <div
                key={partition.worker}
                className="flex items-center justify-between text-[11px]"
              >
                <span className="alora-mono text-[var(--alora-muted)]">
                  Checker {partition.worker} · {partition.lines} lines
                </span>
                <Badge tone={partition.status === "pass" ? "ok" : "danger"}>
                  {partition.status}
                </Badge>
              </div>
            ))}
          </div>
        ) : null}
      </Panel>

      <Panel
        title="Outreach"
        right={<Badge tone="warn">{bundle.courierDrafts.length} drafts</Badge>}
      >
        <div className="flex gap-2">
          <input
            value={courier}
            onChange={(event) => setCourier(event.target.value)}
            className="alora-input min-w-0"
            aria-label="Courier"
          />
          <Button
            className="shrink-0 whitespace-nowrap"
            busy={draftAction.isPending}
            onClick={() =>
              draftAction.mutate(
                { shipmentId, courier },
                {
                  onSuccess: () => toast.success("Draft created."),
                  onError: (error) => fail(error, "Draft failed."),
                },
              )
            }
          >
            <IconSend size={14} /> Draft email
          </Button>
        </div>
        <div className="mt-3 grid gap-2">
          {bundle.courierDrafts.map((draft) => (
            <div
              key={draft.id}
              className="rounded border border-[var(--alora-line)] px-2 py-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[12px]">{draft.subject}</span>
                <Badge
                  tone={
                    draft.status === "sent"
                      ? "ok"
                      : draft.status === "approved"
                        ? "accent"
                        : "warn"
                  }
                >
                  {draft.status}
                </Badge>
              </div>
              <div className="mt-1">
                <HashValue value={draft.sha256} chars={20} />
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  busy={approveDraftAction.isPending}
                  disabled={draft.status !== "draft" || !operatorEmail}
                  onClick={() =>
                    approveDraftAction.mutate(
                      {
                        draftId: draft.id,
                        approverId: operatorEmail ?? undefined,
                        approverKind: "human",
                      },
                      {
                        onSuccess: () => toast.success("Draft approved."),
                        onError: (error) => fail(error, "Approval refused"),
                      },
                    )
                  }
                >
                  Approve draft
                </Button>
                <Button
                  variant="primary"
                  busy={sendDraftAction.isPending}
                  disabled={draft.status !== "approved"}
                  onClick={() =>
                    sendDraftAction.mutate(
                      { draftId: draft.id },
                      {
                        onSuccess: () => toast.success("Email sent."),
                        onError: (error) => fail(error, "Send refused"),
                      },
                    )
                  }
                >
                  Send email
                </Button>
              </div>
            </div>
          ))}
          {bundle.courierDrafts.length === 0 ? (
            <p className="text-[12px] text-[var(--alora-muted)]">
              No drafts yet.
            </p>
          ) : null}
        </div>
      </Panel>

      <Panel
        title="Templates"
        right={
          <Badge tone="accent">{bundle.proposedActions.length} proposals</Badge>
        }
      >
        <div className="flex flex-wrap gap-2">
          <Button
            busy={proposeAction.isPending}
            onClick={() =>
              proposeAction.mutate(
                { shipmentId },
                {
                  onSuccess: () => toast.success("Proposal recorded."),
                  onError: (error) => fail(error, "Proposal failed."),
                },
              )
            }
          >
            Propose capability
          </Button>
        </div>
        <div className="mt-3 grid gap-2">
          {bundle.proposedActions.map((proposal) => (
            <div
              key={proposal.id}
              className="rounded border border-[var(--alora-line)] px-2 py-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="alora-mono text-[12px]">{proposal.name}</span>
                <Badge
                  tone={
                    proposal.status === "active"
                      ? "ok"
                      : proposal.status === "reviewed"
                        ? "accent"
                        : "warn"
                  }
                >
                  {proposal.status}
                </Badge>
              </div>
              <div className="mt-1 text-[11px] text-[var(--alora-muted)]">
                {proposal.reason}
              </div>
              {proposal.reviewedCodeSha256 ? (
                <div className="mt-1">
                  <HashValue
                    label="Reviewed"
                    value={proposal.reviewedCodeSha256}
                    chars={16}
                  />
                </div>
              ) : null}
              <details className="mt-1">
                <summary className="cursor-pointer text-[11px] text-[var(--alora-muted)]">
                  Advanced
                </summary>
                <pre className="alora-mono mt-1 max-h-40 overflow-auto rounded bg-[var(--alora-bg)] p-2 text-[11px] leading-relaxed">
                  {proposal.code}
                </pre>
              </details>
              {proposal.status === "pending" ? (
                <Button
                  className="mt-2"
                  busy={reviewProposalAction.isPending}
                  disabled={!operatorEmail}
                  onClick={() =>
                    reviewProposalAction.mutate(
                      {
                        proposalId: proposal.id,
                        approverId: operatorEmail ?? undefined,
                      },
                      {
                        onSuccess: () => toast.success("Template reviewed."),
                        onError: (error) => fail(error, "Review refused"),
                      },
                    )
                  }
                >
                  Review template
                </Button>
              ) : proposal.status === "reviewed" ? (
                <Button
                  className="mt-2"
                  variant="primary"
                  busy={approveProposalAction.isPending}
                  disabled={!operatorEmail}
                  onClick={() =>
                    approveProposalAction.mutate(
                      {
                        proposalId: proposal.id,
                        approverId: operatorEmail ?? undefined,
                      },
                      {
                        onSuccess: () => toast.success("Capability active."),
                        onError: (error) => fail(error, "Activation refused"),
                      },
                    )
                  }
                >
                  <IconCheck size={14} /> Activate capability
                </Button>
              ) : (
                <div className="mt-2 text-[11px] text-[var(--alora-ok)]">
                  Active · reviewed template
                </div>
              )}
            </div>
          ))}
        </div>
        {bundle.proposedActions.some(
          (proposal) => proposal.status === "active",
        ) ? (
          <div className="mt-3 border-t border-[var(--alora-line)] pt-3">
            <div className="alora-label mb-1">Label check</div>
            <div className="flex gap-2">
              <input
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                className="alora-input min-w-0"
                aria-label="Arabic label"
              />
              <Button
                className="shrink-0 whitespace-nowrap"
                busy={labelAction.isPending}
                onClick={() =>
                  labelAction.mutate(
                    { shipmentId, label },
                    {
                      onSuccess: (result) => setLabelResult(result),
                      onError: (error) => fail(error, "Label check failed."),
                    },
                  )
                }
              >
                Check label
              </Button>
            </div>
            {labelResult ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge tone={labelResult.ok ? "ok" : "danger"}>
                  {labelResult.ok ? "Label ok" : "Label issues"}
                </Badge>
                <span className="alora-mono text-[11px] text-[var(--alora-muted)]">
                  {labelResult.checks.join(" · ")}
                </span>
              </div>
            ) : null}
          </div>
        ) : null}
      </Panel>

      <Panel
        title="Demo script"
        right={
          <Badge tone="accent">
            {demo ? `${demo.ledgerIds.length} events` : "Idle"}
          </Badge>
        }
      >
        <Button
          variant="primary"
          busy={demoAction.isPending}
          onClick={() =>
            demoAction.mutate(
              {},
              {
                onSuccess: (result) => setDemo(result as DemoResult),
                onError: (error) => fail(error, "Script failed."),
              },
            )
          }
        >
          <IconSparkles size={14} /> Generate script
        </Button>
        {demo ? (
          <div className="mt-3 grid gap-2">
            <pre className="alora-mono max-h-64 overflow-auto rounded bg-[var(--alora-bg)] p-3 text-[11px] leading-relaxed">
              {demo.script}
            </pre>
            <div className="grid gap-1">
              {demo.clickPath.slice(0, 6).map((step, index) => (
                <div
                  key={`${step.action}-${index}`}
                  className="flex items-center justify-between gap-2 border-b border-[var(--alora-line)] py-1 text-[11px]"
                >
                  <span className="alora-mono">{step.action}</span>
                  <span className="text-[var(--alora-muted)]">
                    {step.expect}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </Panel>
    </div>
  );
}

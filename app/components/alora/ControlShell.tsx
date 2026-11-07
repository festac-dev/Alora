import {
  actionErrorMessage,
  callAction,
  useActionMutation,
  useActionQuery,
} from "@agent-native/core/client/hooks";
import {
  IconAlertTriangle,
  IconFileSearch,
  IconHistory,
  IconLayoutDashboard,
  IconMessageCircle,
  IconPlugConnected,
  IconRefresh,
  IconTopologyStar3,
} from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { toast } from "sonner";

import { CanvasTab } from "./CanvasTab";
import { EvidenceTab } from "./EvidenceTab";
import { ExtensionsTab } from "./ExtensionsTab";
import { HelpDialog, Tour } from "./HelpDialog";
import { ReplayTab } from "./ReplayTab";
import { ThemeToggle } from "./ThemeToggle";
import type {
  AgentTrust,
  AloraBundle,
  ShipmentSummary,
  VerificationResult,
} from "./types";
import { Badge, Button, EmptyState, HashValue, riskTone } from "./ui";
import { UniverseTab } from "./UniverseTab";
import { useEvidenceCheck } from "./useEvidenceCheck";

const TABS = [
  { id: "canvas", label: "Shipment", icon: IconLayoutDashboard },
  { id: "evidence", label: "Evidence", icon: IconFileSearch },
  { id: "replay", label: "Replay", icon: IconHistory },
  { id: "universe", label: "Agents", icon: IconTopologyStar3 },
  { id: "extensions", label: "Extensions", icon: IconPlugConnected },
] as const;

type TabId = (typeof TABS)[number]["id"];
const TAB_PATHS: Record<TabId, string> = {
  canvas: "shipments",
  evidence: "evidence",
  replay: "replay",
  universe: "agents",
  extensions: "extensions",
};

const TOUR_STORAGE_KEY = "alora.tour.seen.v2";

function isTab(value: string | null): value is TabId {
  return TABS.some((tab) => tab.id === value);
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ControlShell() {
  const [params, setParams] = useSearchParams();
  const { view } = useParams();
  const navigate = useNavigate();
  const shipmentsQuery = useActionQuery("list-shipments", {});
  const agentsQuery = useActionQuery("list-agents", {});
  const operatorQuery = useActionQuery("get-operator", {});
  const operatorEmail = operatorQuery.data?.email ?? null;
  const shipments = (shipmentsQuery.data ?? []) as ShipmentSummary[];
  const agents = (agentsQuery.data ?? []) as AgentTrust[];

  const selectedId = params.get("id") ?? shipments[0]?.id ?? "";
  const tabParam = params.get("tab");
  const routeTab = TABS.find((item) => TAB_PATHS[item.id] === view)?.id;
  const tab: TabId = routeTab ?? (isTab(tabParam) ? tabParam : "canvas");
  const bundleQuery = useActionQuery(
    "get-shipment",
    { shipmentId: selectedId },
    { enabled: Boolean(selectedId) },
  );
  const queriedBundle = bundleQuery.data as AloraBundle | undefined;
  const bundle =
    queriedBundle &&
    [queriedBundle.shipment.id, queriedBundle.shipment.reference].includes(
      selectedId,
    )
      ? queriedBundle
      : undefined;

  const [busy, setBusy] = useState<string | null>(null);
  const evidenceCheck = useEvidenceCheck(selectedId, bundle?.snapshot);
  const verification = evidenceCheck.result;
  const [helpOpen, setHelpOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);

  useEffect(() => {
    if (window.localStorage.getItem(TOUR_STORAGE_KEY)) return;
    setTourOpen(true);
    window.localStorage.setItem(TOUR_STORAGE_KEY, "1");
  }, []);

  useEffect(() => {
    if (!selectedId && shipments[0]) {
      const next = new URLSearchParams(params);
      next.set("id", shipments[0].id);
      setParams(next, { replace: true });
    }
  }, [selectedId, shipments, params, setParams]);

  const seedAction = useActionMutation("seed-demo");
  const architectAction = useActionMutation("architect-plan");
  const builderAction = useActionMutation("builder-classify");
  const auditorAction = useActionMutation("auditor-review");
  const verifierAction = useActionMutation("verifier-check");
  const repairAction = useActionMutation("repair-deliverable");
  const approveAction = useActionMutation("approve-deliverable");
  const tamperAction = useActionMutation("tamper-deliverable");
  const forkAction = useActionMutation("fork-shipment");
  const rewindAction = useActionMutation("rewind-shipment");
  const selfHealAction = useActionMutation("self-heal-document");

  const updateParams = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    if (isTab(patch.tab ?? null)) {
      const nextTab = patch.tab as TabId;
      next.delete("tab");
      navigate({
        pathname: `/control/${TAB_PATHS[nextTab]}`,
        search: next.toString(),
      });
    } else {
      setParams(next, { replace: true });
    }
  };

  const fail = (error: unknown, fallback: string) =>
    toast.error(actionErrorMessage(error) ?? fallback);

  const handleSeed = async () => {
    evidenceCheck.invalidate();
    setBusy("seed");
    try {
      const result = await seedAction.mutateAsync({});
      updateParams({ id: result.shipmentId, tab: "canvas" });
      toast.success(
        `${result.reference} seeded · ${result.failedChecks.length} failing ${result.failedChecks.length === 1 ? "check" : "checks"}.`,
      );
    } catch (error) {
      fail(error, "Seed failed.");
    } finally {
      setBusy(null);
    }
  };

  const handleRunMission = async () => {
    if (!selectedId) return;
    evidenceCheck.invalidate();
    setBusy("mission");
    try {
      await architectAction.mutateAsync({ shipmentId: selectedId });
      await builderAction.mutateAsync({ shipmentId: selectedId });
      await auditorAction.mutateAsync({ shipmentId: selectedId });
      const result = await verifierAction.mutateAsync({
        shipmentId: selectedId,
      });
      toast[result.status === "verified" ? "success" : "error"](
        result.status === "verified"
          ? "Mission complete."
          : `Rejected: ${result.failed.join(", ")}.`,
      );
    } catch (error) {
      fail(error, "Mission failed.");
    } finally {
      setBusy(null);
    }
  };

  const handleRepair = async () => {
    if (!selectedId) return;
    evidenceCheck.invalidate();
    setBusy("repair");
    try {
      const result = await repairAction.mutateAsync({ shipmentId: selectedId });
      toast.success(`Version ${result.version} submitted.`);
    } catch (error) {
      fail(error, "Repair failed.");
    } finally {
      setBusy(null);
    }
  };

  const handleVerify = async () => {
    if (!selectedId) return;
    evidenceCheck.invalidate();
    setBusy("verify");
    try {
      const result = await verifierAction.mutateAsync({
        shipmentId: selectedId,
      });
      toast[result.status === "verified" ? "success" : "error"](
        result.status === "verified"
          ? "Verified."
          : `Rejected: ${result.failed.join(", ")}.`,
      );
    } catch (error) {
      fail(error, "Verify failed");
    } finally {
      setBusy(null);
    }
  };

  const handleApprove = async (acknowledgeTariffBaseLevel: boolean) => {
    if (!selectedId || !bundle?.activeDeliverable) return;
    if (!operatorEmail) {
      toast.error("Sign in to approve.");
      return;
    }
    evidenceCheck.invalidate();
    setBusy("approve");
    try {
      const result = await approveAction.mutateAsync({
        shipmentId: selectedId,
        deliverableId: bundle.activeDeliverable.id,
        approverId: operatorEmail,
        approverKind: "human",
        acknowledgeTariffBaseLevel,
      });
      toast.success(`Approval bound to ${result.boundHash.slice(0, 16)}…`);
    } catch (error) {
      fail(error, "Approval refused.");
      // A refused stale approval may have committed a compensating revocation.
      await Promise.allSettled([
        bundleQuery.refetch(),
        shipmentsQuery.refetch(),
        agentsQuery.refetch(),
      ]);
    } finally {
      setBusy(null);
    }
  };

  const handleTamper = async () => {
    if (!selectedId) return;
    evidenceCheck.invalidate();
    setBusy("tamper");
    try {
      const result = await tamperAction.mutateAsync({ shipmentId: selectedId });
      if (result.detected) {
        toast.error(
          `Hash mismatch. ${result.revokedApprovals} ${result.revokedApprovals === 1 ? "approval" : "approvals"} revoked.`,
        );
      } else {
        toast.success("No mismatch.");
      }
    } catch (error) {
      fail(error, "Tamper probe failed.");
    } finally {
      setBusy(null);
    }
  };

  const handleFork = async (destination: "DE" | "US" | "AE") => {
    if (!selectedId) return;
    evidenceCheck.invalidate();
    setBusy(`fork-${destination}`);
    try {
      const result = await forkAction.mutateAsync({
        shipmentId: selectedId,
        destination,
      });
      toast.success(`${result.reference} forked.`);
      updateParams({ id: result.forkId, tab: "canvas" });
    } catch (error) {
      fail(error, "Fork failed.");
    } finally {
      setBusy(null);
    }
  };

  const handleRewind = async (ledgerId: number) => {
    if (!selectedId) return;
    evidenceCheck.invalidate();
    setBusy(`rewind-${ledgerId}`);
    try {
      const result = await rewindAction.mutateAsync({
        shipmentId: selectedId,
        toLedgerId: ledgerId,
      });
      toast.success(
        `Rewound to #${result.rewoundTo}. ${result.applied.length} events appended.`,
      );
    } catch (error) {
      fail(error, "Rewind failed.");
    } finally {
      setBusy(null);
    }
  };

  const handleSelfHeal = async (apply: boolean) => {
    if (!selectedId) return;
    evidenceCheck.invalidate();
    setBusy("self-heal");
    try {
      const result = await selfHealAction.mutateAsync({
        shipmentId: selectedId,
        apply,
      });
      toast.success(
        apply
          ? `v${result.applied?.version ?? "?"} created. Approval revoked.`
          : `${result.patches.length} patches · ${Math.round(result.confidence * 100)}% match.`,
      );
    } catch (error) {
      fail(error, "Self-heal failed.");
    } finally {
      setBusy(null);
    }
  };

  const handleVerifyChain = async () => {
    if (!selectedId) return;
    setBusy("chain");
    try {
      const result = await evidenceCheck.verify();
      if (!result) return;
      toast[result.valid ? "success" : "error"](
        result.valid
          ? result.historicalMismatches
            ? `Current artifact matches. ${result.historicalMismatches} historical mismatches preserved.`
            : "Chain and document hashes match."
          : result.hasActiveDocument
            ? "Integrity check failed."
            : "No active document to check.",
      );
    } catch (error) {
      fail(error, "Chain check failed.");
    } finally {
      setBusy(null);
    }
  };

  const handleExport = async () => {
    if (!selectedId) return;
    setBusy("export");
    try {
      const manifest = await callAction<Record<string, unknown>>(
        "export-shipment",
        { shipmentId: selectedId },
        { method: "GET" },
      );
      downloadJson(
        `alora-manifest-${bundle?.shipment.reference ?? selectedId}.json`,
        manifest,
      );
      toast.success("Manifest downloaded.");
    } catch (error) {
      fail(error, "Export failed.");
    } finally {
      setBusy(null);
    }
  };

  const headerMeta = useMemo(() => {
    if (!bundle) return null;
    const riskLabel =
      bundle.risk === "critical"
        ? "Hash mismatch"
        : bundle.risk === "red"
          ? "Verification failed"
          : bundle.risk === "green"
            ? "Approved"
            : bundle.integrity.verificationCurrent
              ? "Awaiting approval"
              : "Awaiting verification";
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="accent">{bundle.shipment.destination}</Badge>
        <Badge tone={riskTone(bundle.risk)}>{riskLabel}</Badge>
        <Badge tone={bundle.chain.valid ? "ok" : "danger"}>
          {bundle.chain.valid ? "Chain valid" : "Chain broken"}
        </Badge>
      </div>
    );
  }, [bundle]);

  return (
    <div className="alora-root flex h-full min-h-0 w-full flex-col">
      <header className="alora-control-header flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--alora-line)] px-4 py-2 md:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <a href="/" aria-label="Alora home" className="flex items-center gap-2">
            <img src="/logo-mark.svg" width="32" height="32" alt="" />
            <span className="hidden text-lg font-semibold tracking-tight lg:inline">Alora</span>
          </a>
          <div className="min-w-0 leading-tight">
            <h1 className="text-[14px] font-semibold">
              {TABS.find((item) => item.id === tab)?.label}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-2 md:flex">
            <Badge tone={operatorEmail ? "ok" : "neutral"}>
              {operatorEmail
                ? `Operator ${operatorEmail}`
                : "No operator session"}
            </Badge>
          </div>
          <Button variant="ghost" onClick={() => setHelpOpen(true)}>
            Help
          </Button>
          <a href="/chat" className="alora-button" aria-label="Open agent">
            <IconMessageCircle size={14} />{" "}
            <span className="alora-agent-label">Open agent</span>
          </a>
          <ThemeToggle />
        </div>
      </header>

      <HelpDialog
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        onStartTour={() => {
          setHelpOpen(false);
          setTourOpen(true);
        }}
      />
      <Tour open={tourOpen} onClose={() => setTourOpen(false)} />

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <nav
          aria-label="Mission control navigation"
          className="alora-control-nav shrink-0 border-b border-[var(--alora-line)] md:w-[228px] md:border-r md:border-b-0"
        >
          <div className="flex overflow-x-auto md:block">
            {TABS.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.id}
                  className="alora-nav-item shrink-0 justify-center md:justify-start"
                  data-active={tab === item.id}
                  aria-current={tab === item.id ? "page" : undefined}
                  to={{
                    pathname: `/control/${TAB_PATHS[item.id]}`,
                    search: selectedId
                      ? `?id=${encodeURIComponent(selectedId)}`
                      : "",
                  }}
                  title={item.label}
                >
                  <Icon size={15} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
          <div className="hidden border-t border-[var(--alora-line)] py-2 md:block">
            <a href="/chat" className="alora-nav-item">
              Chat
            </a>
            <a href="/settings" className="alora-nav-item">
              Settings
            </a>
            <a href="/" className="alora-nav-item">
              About Alora
            </a>
          </div>

          <div className="hidden border-t border-[var(--alora-line)] px-3 py-3 md:block">
            <div className="flex items-center justify-between">
              <span className="alora-label">Shipments</span>
              <span className="alora-mono text-[11px] text-[var(--alora-muted)]">
                {shipments.length}
              </span>
            </div>
            <div className="mt-2 grid max-h-[38vh] gap-1 overflow-y-auto pr-1">
              {shipments.map((shipment) => (
                <button
                  key={shipment.id}
                  type="button"
                  onClick={() => updateParams({ id: shipment.id })}
                  className="w-full rounded border px-2 py-2 text-left transition-colors duration-100 hover:bg-[var(--alora-raised)]"
                  style={{
                    background:
                      shipment.id === selectedId
                        ? "var(--alora-raised)"
                        : "transparent",
                    borderColor:
                      shipment.id === selectedId
                        ? "var(--alora-line-strong)"
                        : "transparent",
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="alora-mono truncate text-[11px]">
                      {shipment.reference}
                    </span>
                    <span
                      className="size-1.5 shrink-0 rounded-full"
                      style={{
                        background:
                          shipment.risk === "red"
                            ? "var(--alora-danger)"
                            : shipment.risk === "green"
                              ? "var(--alora-ok)"
                              : "var(--alora-warn)",
                      }}
                    />
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-[var(--alora-muted)]">
                    <span>
                      {shipment.destination} · {shipment.itemCount} lines
                    </span>
                    <span>{shipment.source}</span>
                  </div>
                </button>
              ))}
            </div>
            <div className="mt-3 grid gap-2">
              <Button
                busy={busy === "seed"}
                onClick={() => void handleSeed()}
                className="w-full"
              >
                Reset demo
              </Button>
              <a href="/chat" className="alora-button w-full">
                Create shipment
              </a>
            </div>
          </div>
        </nav>

        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">
          {shipmentsQuery.isLoading ? (
            <div className="p-6 text-[12px] text-[var(--alora-muted)]">
              Loading shipments
            </div>
          ) : shipmentsQuery.error ? (
            <div className="p-6" role="alert">
              <EmptyState
                title="Shipments could not be loaded"
                action={
                  <Button onClick={() => void shipmentsQuery.refetch()}>
                    Retry loading
                  </Button>
                }
              />
            </div>
          ) : shipments.length === 0 ? (
            <div className="p-6">
              <div className="mx-auto max-w-xl">
                <EmptyState
                  title="No shipments yet"
                  action={
                    <Button
                      variant="primary"
                      busy={busy === "seed"}
                      onClick={() => void handleSeed()}
                    >
                      Seed demo shipment
                    </Button>
                  }
                />
              </div>
            </div>
          ) : bundleQuery.isLoading && !bundle ? (
            <div className="p-6 text-[12px] text-[var(--alora-muted)]">
              Loading shipment
            </div>
          ) : bundleQuery.error ? (
            <div className="p-6">
              <EmptyState
                title="This shipment could not load"
                detail={
                  actionErrorMessage(bundleQuery.error) ??
                  "Unknown action error."
                }
                action={
                  <Button onClick={() => void bundleQuery.refetch()}>
                    Retry
                  </Button>
                }
              />
            </div>
          ) : bundle ? (
            <div className="p-4 md:p-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="alora-label">
                    {bundle.shipment.forkedFrom ? "Fork" : "Shipment"}
                  </div>
                  <h1 className="mt-1 flex flex-wrap items-center gap-2 text-[19px] font-semibold">
                    {bundle.shipment.reference}
                    <span className="text-[12px] font-normal text-[var(--alora-muted)]">
                      {bundle.shipment.exporter} to {bundle.shipment.importer}
                    </span>
                  </h1>
                  <div className="mt-2">{headerMeta}</div>
                </div>
                <Button
                  variant="ghost"
                  onClick={() => void bundleQuery.refetch()}
                  aria-label="Refresh evidence"
                  title="Refresh evidence"
                  className="px-2"
                >
                  <IconRefresh size={15} />
                </Button>
              </div>

              {bundle.integrity.hasDeliverable &&
              !bundle.integrity.hashMatches ? (
                <div className="alora-notice alora-notice-danger mb-4 items-start">
                  <IconAlertTriangle
                    size={16}
                    className="mt-[1px] shrink-0 text-[var(--alora-danger)]"
                  />
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium">
                      {bundle.integrity.approvalRevoked
                        ? "Approval revoked."
                        : "Hash mismatch."}
                    </div>
                    <div className="mt-1">
                      <HashValue
                        value={bundle.activeDeliverable?.sha256}
                        label="Expected"
                        chars={18}
                      />
                    </div>
                  </div>
                </div>
              ) : null}

              {tab === "canvas" ? (
                <CanvasTab
                  bundle={bundle}
                  busy={busy}
                  canApprove={Boolean(operatorEmail)}
                  actions={{
                    runMission: handleRunMission,
                    repair: handleRepair,
                    verify: handleVerify,
                    approve: handleApprove,
                    tamper: handleTamper,
                    fork: handleFork,
                    selfHeal: handleSelfHeal,
                  }}
                />
              ) : tab === "evidence" ? (
                <EvidenceTab
                  bundle={bundle}
                  verification={verification}
                  busy={busy}
                  onVerifyChain={handleVerifyChain}
                  onExport={handleExport}
                />
              ) : tab === "replay" ? (
                <ReplayTab
                  bundle={bundle}
                  busy={busy}
                  onRewind={handleRewind}
                />
              ) : tab === "universe" ? (
                <UniverseTab bundle={bundle} agents={agents} />
              ) : (
                <ExtensionsTab
                  bundle={bundle}
                  operatorEmail={operatorEmail}
                  onOpenShipment={(shipmentId) =>
                    updateParams({ id: shipmentId, tab: "canvas" })
                  }
                />
              )}

              <footer className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--alora-line)] pt-3 text-[11px] text-[var(--alora-muted)]">
                <span>Ledger tip</span>
                <HashValue value={bundle.chain.tipHash} chars={24} />
              </footer>
            </div>
          ) : (
            <div className="p-6">
              <EmptyState
                title="No shipment selected"
                action={
                  <Button onClick={() => void handleSeed()}>
                    Seed demo shipment
                  </Button>
                }
              />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

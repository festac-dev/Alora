import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import {
  customsDocumentSchema,
  verificationCheckSchema,
} from "../../shared/customs-schema.js";
import { verificationInputsHash } from "../../shared/verification-inputs.js";
import { getDb } from "../db/index.js";
import {
  agents,
  approvals,
  claims,
  courierDrafts,
  deliverables,
  evidence,
  items,
  ledgerHead,
  missions,
  proposedActions,
  shipments,
  tariffRows,
  tasks,
  verificationRuns,
} from "../db/schema.js";
import { hashBytes } from "./hash.js";
import { checkChain, ledgerEntries } from "./ledger.js";
import {
  proofMatches,
  proofWasRecorded,
  approvalWasRecorded,
  storedConsentCovers,
} from "./proofs.js";
import { tariffRequirements } from "./tariffs.js";
import { snapshotQuery } from "./transactions.js";

type Row = Record<string, unknown>;

export function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export async function getShipmentRow(idOrRef: string) {
  const db = getDb();
  const byId = await db
    .select()
    .from(shipments)
    .where(eq(shipments.id, idOrRef))
    .limit(1);
  if (byId[0]) return byId[0];
  const byRef = await db
    .select()
    .from(shipments)
    .where(eq(shipments.reference, idOrRef))
    .limit(1);
  return byRef[0] ?? null;
}

function currentEvidenceState(
  shipment: typeof shipments.$inferSelect,
  shipmentItems: (typeof items.$inferSelect)[],
  shipmentClaims: (typeof claims.$inferSelect)[],
  shipmentDeliverables: (typeof deliverables.$inferSelect)[],
  shipmentApprovals: (typeof approvals.$inferSelect)[],
  runs: (typeof verificationRuns.$inferSelect)[],
  ledgerRows: Awaited<ReturnType<typeof ledgerEntries>>,
  chain: { valid: boolean },
) {
  const claim = shipmentClaims[0] ?? null;
  const activeDeliverable =
    shipmentDeliverables.find(
      (row) => row.id === claim?.deliverableId && row.state === "active",
    ) ?? null;
  const recordedApproval = shipmentApprovals.find(
    (row) => row.deliverableId === activeDeliverable?.id && !row.revoked,
  );
  const approvalHistory = shipmentApprovals.find(
    (row) => row.deliverableId === activeDeliverable?.id,
  );
  const lastRun = runs.find(
    (run) =>
      run.id === claim?.verificationRunId &&
      run.deliverableId === activeDeliverable?.id,
  );
  const hashMatches = activeDeliverable
    ? hashBytes(activeDeliverable.bytes) === activeDeliverable.sha256
    : false;
  const hasDeliverable = Boolean(activeDeliverable);
  const approvalHashMatches =
    recordedApproval && activeDeliverable
      ? recordedApproval.approvedSha256 === hashBytes(activeDeliverable.bytes)
      : null;

  const parsed = customsDocumentSchema.safeParse(
    activeDeliverable ? parseJson(activeDeliverable.bytes, null) : null,
  );
  const document = parsed.success ? parsed.data : null;
  const requirements = document
    ? tariffRequirements(document, shipment.destination)
    : { unconfirmedCodes: [], unresolvedCodes: [] };
  const inputsHash = verificationInputsHash({ shipment, items: shipmentItems });
  const binding = {
    shipmentId: shipment.id,
    deliverableId: activeDeliverable?.id ?? "",
    sha256: activeDeliverable?.sha256 ?? "",
    inputsHash,
  };
  const verificationCurrent =
    Boolean(document) &&
    chain.valid &&
    requirements.unresolvedCodes.length === 0 &&
    hashMatches &&
    proofMatches(lastRun, binding) &&
    proofWasRecorded(lastRun, ledgerRows);
  const currentApproval =
    recordedApproval &&
    claim?.status === "human-approved" &&
    chain.valid &&
    verificationCurrent &&
    approvalHashMatches &&
    document &&
    requirements.unresolvedCodes.length === 0 &&
    storedConsentCovers(recordedApproval, requirements.unconfirmedCodes) &&
    recordedApproval.approverKind === "human" &&
    approvalWasRecorded(recordedApproval, ledgerRows) &&
    proofMatches(
      runs.find((run) => run.id === recordedApproval.verificationRunId),
      binding,
    ) &&
    proofWasRecorded(
      runs.find((run) => run.id === recordedApproval.verificationRunId),
      ledgerRows,
    )
      ? recordedApproval
      : null;
  const risk =
    hasDeliverable && !hashMatches
      ? "critical"
      : lastRun?.status === "rejected"
        ? "red"
        : currentApproval
          ? "green"
          : "amber";

  return {
    claim,
    activeDeliverable,
    currentApproval,
    approvalHistory,
    lastRun,
    hashMatches,
    hasDeliverable,
    approvalHashMatches,
    document,
    requirements,
    verificationCurrent,
    risk,
  };
}

export const getShipmentBundle = snapshotQuery(getShipmentBundleImpl);
async function getShipmentBundleImpl(idOrRef: string) {
  const shipment = await getShipmentRow(idOrRef);
  if (!shipment) return null;
  const db = getDb();

  const [
    shipmentItems,
    shipmentClaims,
    shipmentDeliverables,
    shipmentApprovals,
    runs,
    evidenceRows,
    missionRows,
    ledgerRows,
    drafts,
    proposals,
    tariffData,
  ] = await Promise.all([
    db.select().from(items).where(eq(items.shipmentId, shipment.id)),
    db
      .select()
      .from(claims)
      .where(eq(claims.shipmentId, shipment.id))
      .orderBy(desc(claims.updatedAt)),
    db
      .select()
      .from(deliverables)
      .where(eq(deliverables.shipmentId, shipment.id))
      .orderBy(desc(deliverables.version)),
    db
      .select()
      .from(approvals)
      .where(eq(approvals.shipmentId, shipment.id))
      .orderBy(desc(approvals.createdAt)),
    db
      .select()
      .from(verificationRuns)
      .where(eq(verificationRuns.shipmentId, shipment.id))
      .orderBy(desc(verificationRuns.createdAt)),
    db
      .select()
      .from(evidence)
      .where(eq(evidence.shipmentId, shipment.id))
      .orderBy(desc(evidence.createdAt)),
    db.select().from(missions).where(eq(missions.shipmentId, shipment.id)),
    ledgerEntries(shipment.id),
    db
      .select()
      .from(courierDrafts)
      .where(eq(courierDrafts.shipmentId, shipment.id))
      .orderBy(desc(courierDrafts.createdAt)),
    db
      .select()
      .from(proposedActions)
      .where(eq(proposedActions.shipmentId, shipment.id))
      .orderBy(desc(proposedActions.createdAt)),
    db
      .select()
      .from(tariffRows)
      .where(eq(tariffRows.jurisdiction, shipment.destination)),
  ]);

  const missionTasks = missionRows[0]
    ? await db
        .select()
        .from(tasks)
        .where(eq(tasks.missionId, missionRows[0].id))
    : [];

  const allLedgerRows = await ledgerEntries();
  const chain = checkChain(allLedgerRows);
  const [head] = await db
    .select()
    .from(ledgerHead)
    .where(eq(ledgerHead.id, "global"));
  chain.valid =
    chain.valid &&
    head?.tipHash === chain.tipHash &&
    head?.tipId === (allLedgerRows[allLedgerRows.length - 1]?.id ?? 0);
  const {
    claim,
    activeDeliverable,
    currentApproval,
    approvalHistory,
    lastRun,
    hashMatches,
    hasDeliverable,
    approvalHashMatches,
    document,
    requirements,
    verificationCurrent,
    risk,
  } = currentEvidenceState(
    shipment,
    shipmentItems,
    shipmentClaims,
    shipmentDeliverables,
    shipmentApprovals,
    runs,
    ledgerRows,
    chain,
  );

  return {
    shipment,
    items: shipmentItems,
    claim,
    deliverables: shipmentDeliverables.map((row) => ({
      ...row,
      bytes: undefined,
      byteLength: Buffer.byteLength(row.bytes, "utf8"),
      hashMatches: hashBytes(row.bytes) === row.sha256,
    })),
    activeDeliverable: activeDeliverable
      ? {
          ...activeDeliverable,
          byteLength: Buffer.byteLength(activeDeliverable.bytes, "utf8"),
          hashMatches,
        }
      : null,
    document,
    tariffRequirements: {
      ...requirements,
      resolved: Boolean(document) && requirements.unresolvedCodes.length === 0,
    },
    approvals: shipmentApprovals,
    activeApproval: currentApproval ?? null,
    approvalHistory: approvalHistory ?? null,
    verificationRuns: runs.map((run) => ({
      ...run,
      checks: z
        .array(verificationCheckSchema)
        .catch([])
        .parse(parseJson(run.checks, [])),
    })),
    lastVerification: lastRun
      ? {
          ...lastRun,
          checks: z
            .array(verificationCheckSchema)
            .catch([])
            .parse(parseJson(lastRun.checks, [])),
        }
      : null,
    evidence: evidenceRows.map((row) => ({
      ...row,
      detail: parseJson<unknown>(row.detail, null),
    })),
    mission: missionRows[0] ?? null,
    tasks: missionTasks,
    ledger: ledgerRows,
    chain: {
      ...chain,
      entries: ledgerRows.length,
      globalEntries: allLedgerRows.length,
      tipHash: allLedgerRows[allLedgerRows.length - 1]?.entryHash ?? "GENESIS",
    },
    courierDrafts: drafts,
    proposedActions: proposals,
    tariffs: tariffData,
    risk,
    integrity: {
      hashMatches,
      hasDeliverable,
      verificationCurrent,
      approvalHashMatches,
      approvalRevoked: Boolean(approvalHistory?.revoked),
    },
    snapshot: {
      shipmentId: shipment.id,
      deliverableId: activeDeliverable?.id ?? null,
      storedHash: activeDeliverable?.sha256 ?? null,
      actualHash: activeDeliverable ? hashBytes(activeDeliverable.bytes) : null,
      inputsHash: verificationInputsHash({ shipment, items: shipmentItems }),
      verificationRunId: claim?.verificationRunId ?? null,
      approvalId: currentApproval?.id ?? null,
      ledgerTip:
        allLedgerRows[allLedgerRows.length - 1]?.entryHash ?? "GENESIS",
    },
  };
}

export const listShipmentSummaries = snapshotQuery(async () => {
  const db = getDb();
  const [
    rows,
    allItems,
    allClaims,
    activeDocuments,
    allApprovals,
    allRuns,
    allLedger,
    heads,
  ] = await Promise.all([
    db.select().from(shipments).orderBy(desc(shipments.createdAt)),
    db.select().from(items),
    db.select().from(claims).orderBy(desc(claims.updatedAt)),
    db.select().from(deliverables).where(eq(deliverables.state, "active")),
    db
      .select()
      .from(approvals)
      .where(eq(approvals.revoked, false))
      .orderBy(desc(approvals.createdAt)),
    db.select().from(verificationRuns),
    ledgerEntries(),
    db.select().from(ledgerHead).where(eq(ledgerHead.id, "global")),
  ]);
  const byShipment = <T extends { shipmentId: string }>(entries: T[]) => {
    const groups = new Map<string, T[]>();
    for (const entry of entries) {
      const group = groups.get(entry.shipmentId) ?? [];
      group.push(entry);
      groups.set(entry.shipmentId, group);
    }
    return groups;
  };
  const itemGroups = byShipment(allItems),
    claimGroups = byShipment(allClaims),
    documentGroups = byShipment(activeDocuments),
    approvalGroups = byShipment(allApprovals),
    runGroups = byShipment(allRuns),
    ledgerGroups = byShipment(allLedger);
  const chain = checkChain(allLedger);
  chain.valid =
    chain.valid &&
    heads[0]?.tipHash === chain.tipHash &&
    heads[0]?.tipId === (allLedger[allLedger.length - 1]?.id ?? 0);
  return rows.map((shipment) => {
    const shipmentItems = itemGroups.get(shipment.id) ?? [];
    const state = currentEvidenceState(
      shipment,
      shipmentItems,
      claimGroups.get(shipment.id) ?? [],
      documentGroups.get(shipment.id) ?? [],
      approvalGroups.get(shipment.id) ?? [],
      runGroups.get(shipment.id) ?? [],
      ledgerGroups.get(shipment.id) ?? [],
      chain,
    );
    return {
      id: shipment.id,
      reference: shipment.reference,
      destination: shipment.destination,
      status: shipment.status,
      source: shipment.source,
      forkedFrom: shipment.forkedFrom,
      createdAt: shipment.createdAt,
      itemCount: shipmentItems.length,
      units: shipmentItems.reduce((total, item) => total + item.quantity, 0),
      claimStatus: state.currentApproval
        ? "human-approved"
        : state.verificationCurrent
          ? "verified"
          : state.activeDeliverable
            ? "submitted"
            : state.claim
              ? "claimed"
              : "none",
      verification:
        state.lastRun?.status === "rejected"
          ? "rejected"
          : state.verificationCurrent
            ? "verified"
            : "none",
      risk: state.risk,
    };
  });
});

export const listAgentsWithTrust = snapshotQuery(async () => {
  const db = getDb();
  const agentRows = await db.select().from(agents).orderBy(agents.createdAt);
  const claimRows = await db.select().from(claims);
  const runRows = await db.select().from(verificationRuns);
  const approvalRows = await db.select().from(approvals);
  const ledgerRows = await ledgerEntries();

  return agentRows.map((agent) => {
    const ownClaims = claimRows.filter((claim) => claim.agentId === agent.id);
    const verified = ownClaims.filter(
      (claim) =>
        claim.status === "verified" || claim.status === "human-approved",
    ).length;
    const shipmentIds = new Set(ownClaims.map((claim) => claim.shipmentId));
    const rejectedRuns = runRows.filter(
      (run) => shipmentIds.has(run.shipmentId) && run.status === "rejected",
    ).length;
    const approvalsGranted = approvalRows.filter(
      (approval) => approval.approverId === agent.id && !approval.revoked,
    ).length;
    const entries = ledgerRows.filter(
      (entry) =>
        entry.actor === agent.id ||
        entry.payload.includes(`"agentId":"${agent.id}"`),
    );
    const chain = checkChain(ledgerRows);
    const score =
      ownClaims.length === 0
        ? 50
        : Math.max(
            0,
            Math.min(
              100,
              Math.round((verified / ownClaims.length) * 100) -
                rejectedRuns * 5 -
                approvalsGranted * 25,
            ),
          );
    return {
      ...agent,
      totalClaims: ownClaims.length,
      verifiedClaims: verified,
      rejectedRuns,
      approvalsGranted,
      ledgerEntries: entries.length,
      chainValid: chain.valid,
      trustScore: score,
    };
  });
});

import { randomUUID } from "node:crypto";

import { and, desc, eq, inArray, sql } from "drizzle-orm";

import type {
  CustomsDocument,
  ItemLike,
  VerificationCheck,
} from "../../shared/alora-types.js";
import {
  manifestSchema,
  type ShipmentManifest,
} from "../../shared/manifest.js";
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
  ledger,
  ledgerHead,
  missions,
  proposedActions,
  shipments,
  tariffRows,
  tasks,
  verificationRuns,
} from "../db/schema.js";
import { auditPackage } from "./auditor.js";
import { transitionClaim } from "./claim-lifecycle.js";
import {
  buildCustomsPackage,
  classifyDescription,
  round2,
} from "./document.js";
import { canonicalJSON, hashBytes, sha256 } from "./hash.js";
import {
  appendLedger,
  checkChain,
  ledgerEntries,
  type CallerTag,
} from "./ledger.js";
import { evaluateApproval, evaluateHumanReview, planRewind } from "./policy.js";
import {
  proofMatches,
  proofWasRecorded,
  approvalWasRecorded,
  storedConsentCovers,
} from "./proofs.js";
import { getShipmentBundle, getShipmentRow, parseJson } from "./queries.js";
import { datasetVersionFor, tariffVersionVector } from "./tariffs.js";
import {
  atomicMutation,
  RevocationRefusal,
  snapshotQuery,
} from "./transactions.js";
import { verifyPackage, VERIFICATION_POLICY_VERSION } from "./verification.js";

export interface Provenance {
  caller: CallerTag;
  actor: string;
  authenticatedApprover?: string | null;
}

const BASE_AGENTS = [
  {
    id: "agent-architect",
    role: "architect",
    displayName: "Architect · mission planning",
  },
  { id: "agent-builder", role: "builder", displayName: "Builder · documents" },
  {
    id: "agent-auditor",
    role: "auditor",
    displayName: "Auditor · adversarial",
  },
  {
    id: "agent-verifier",
    role: "verifier",
    displayName: "Verifier · deterministic",
  },
];

export const ensureAgents = atomicMutation(ensureAgentsImpl);
async function ensureAgentsImpl(): Promise<void> {
  const db = getDb();
  for (const agent of BASE_AGENTS) {
    await db
      .insert(agents)
      .values({
        id: agent.id,
        kind: "agent",
        role: agent.role,
        displayName: agent.displayName,
      })
      .onConflictDoNothing();
  }
}

export const createShipment = atomicMutation(createShipmentImpl);
async function createShipmentImpl(
  input: {
    destination: string;
    currency: string;
    origin?: string;
    incoterms?: string;
    exporter?: string;
    importer?: string;
    shippingCost?: number;
    insuranceCost?: number;
    notes?: string | undefined;
    reference?: string | undefined;
    source?: string | undefined;
    forkedFrom?: string | undefined;
    items: Array<{
      description: string;
      quantity: number;
      unitValue: number;
      hsCode?: string | null | undefined;
      weightKg?: number | undefined;
      countryOfOrigin?: string;
      currency?: string | undefined;
    }>;
  },
  provenance: Provenance,
): Promise<{ id: string; reference: string }> {
  const db = getDb();
  await ensureAgents();
  const id = randomUUID();
  const reference =
    input.reference ??
    `ALO-${input.destination}-${id.slice(0, 6).toUpperCase()}`;
  const origin = input.origin ?? "DE";
  const currency = input.currency;
  const shippingCost = round2(input.shippingCost ?? 0);
  const insuranceCost = round2(input.insuranceCost ?? 0);
  const classified = input.items.map((item) => {
    const proposed = item.hsCode
      ? {
          hsCode: item.hsCode,
          confidence: 0.9,
          rationale: "HS code supplied by the operator.",
        }
      : classifyDescription(item.description);
    return { ...item, proposed };
  });
  const stateHash = sha256(
    canonicalJSON({
      destination: input.destination,
      currency,
      incoterms: input.incoterms ?? "DAP",
      shippingCost,
      insuranceCost,
      items: classified.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unitValue: round2(item.unitValue),
        hsCode: item.proposed.hsCode,
      })),
    }),
  );

  await db.insert(shipments).values({
    id,
    reference,
    origin,
    destination: input.destination,
    status: "draft",
    currency,
    incoterms: input.incoterms ?? "DAP",
    exporter: input.exporter ?? "Alora Trading GmbH",
    importer: input.importer ?? "Northline Imports LLC",
    shippingCost,
    insuranceCost,
    source: input.source ?? provenance.caller,
    forkedFrom: input.forkedFrom ?? null,
    notes: input.notes ?? null,
    stateHash,
  });

  for (const item of classified) {
    await db.insert(items).values({
      id: randomUUID(),
      shipmentId: id,
      description: item.description,
      hsCode: item.proposed.hsCode,
      hsConfidence: item.proposed.confidence,
      hsRationale: item.proposed.rationale,
      quantity: item.quantity,
      unitValue: round2(item.unitValue),
      currency: item.currency ?? currency,
      weightKg: round2(item.weightKg ?? 0),
      countryOfOrigin: item.countryOfOrigin ?? origin,
    });
  }

  await db.insert(claims).values({
    id: randomUUID(),
    shipmentId: id,
    agentId: "agent-builder",
    type: "customs-package",
    status: "claimed",
    inputsHash: stateHash,
    tariffVersion: tariffVersionVector(input.destination),
    confidence: classified.length
      ? Math.min(...classified.map((item) => item.proposed.confidence))
      : 0,
    rationale: classified[0]?.proposed.rationale ?? null,
  });

  await db.insert(evidence).values({
    id: randomUUID(),
    shipmentId: id,
    kind: "shipment-created",
    summary: `${reference} created for ${input.destination} with ${classified.length} line(s).`,
    detail: canonicalJSON({
      stateHash,
      destination: input.destination,
      source: input.source ?? provenance.caller,
      forkedFrom: input.forkedFrom ?? null,
    }),
  });

  await appendLedger({
    shipmentId: id,
    actionName: "createShipment",
    caller: provenance.caller,
    actor: provenance.actor,
    payload: { reference, destination: input.destination, stateHash },
    inverseAction: "archiveShipment",
  });

  return { id, reference };
}

export const runArchitect = atomicMutation(runArchitectImpl);
async function runArchitectImpl(
  shipmentId: string,
  provenance: Provenance,
): Promise<{
  missionId: string;
  taskCount: number;
  acceptanceCriteria: string[];
}> {
  const db = getDb();
  const shipment = await getShipmentRow(shipmentId);
  if (!shipment) throw new Error("Shipment not found");
  const shipmentItems = await db
    .select()
    .from(items)
    .where(eq(items.shipmentId, shipment.id));
  const criteria = [
    `Commercial invoice totals reconcile for ${shipment.destination}.`,
    "Tariff rows are versioned and cited for every classified line.",
    "Duty and VAT are recomputed independently by the Verifier.",
    "Every deliverable is SHA-256 locked before verification.",
    "A human approves the exact verified hash; no agent may approve.",
    "Classification confidence is shown and confirmed by a human.",
  ];
  const existingMission = await db
    .select()
    .from(missions)
    .where(eq(missions.shipmentId, shipment.id))
    .orderBy(desc(missions.createdAt))
    .limit(1);
  const missionId = existingMission[0]?.id ?? randomUUID();
  if (existingMission[0]) {
    await db
      .update(missions)
      .set({
        outcome: `Prepare a compliant ${shipment.destination} customs package for ${shipment.reference}.`,
        acceptanceCriteria: canonicalJSON(criteria),
        status: "running",
      })
      .where(eq(missions.id, missionId));
    await db.delete(tasks).where(eq(tasks.missionId, missionId));
  } else {
    await db.insert(missions).values({
      id: missionId,
      shipmentId: shipment.id,
      outcome: `Prepare a compliant ${shipment.destination} customs package for ${shipment.reference}.`,
      acceptanceCriteria: canonicalJSON(criteria),
      budget: 25,
      deadline: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(),
      status: "running",
    });
  }
  const taskSpecs = [
    ["Classify every item and build the customs package", "agent-builder"],
    ["Challenge totals and unsupported claims", "agent-auditor"],
    ["Recompute duty, VAT and landed cost", "agent-verifier"],
    ["Confirm classification and approve the verified hash", "human-operator"],
  ] as const;
  for (const [title, assignee] of taskSpecs) {
    await db.insert(tasks).values({
      id: randomUUID(),
      missionId,
      title,
      assigneeAgentId: assignee,
      status: "pending",
    });
  }
  await db
    .update(shipments)
    .set({ status: "mission-running", updatedAt: new Date().toISOString() })
    .where(eq(shipments.id, shipment.id));

  await appendLedger({
    shipmentId: shipment.id,
    actionName: "architectPlan",
    caller: provenance.caller,
    actor: provenance.actor,
    payload: {
      missionId,
      criteria,
      taskCount: taskSpecs.length,
      itemCount: shipmentItems.length,
    },
    inverseAction: "closeMission",
  });
  return {
    missionId,
    taskCount: taskSpecs.length,
    acceptanceCriteria: criteria,
  };
}

function docBytes(document: CustomsDocument): string {
  return canonicalJSON(document);
}

export const runBuilder = atomicMutation(runBuilderImpl);
async function runBuilderImpl(
  shipmentId: string,
  provenance: Provenance,
  options?: { plantedVatError?: boolean },
): Promise<{
  deliverableId: string;
  sha256: string;
  version: number;
  document: CustomsDocument;
}> {
  const db = getDb();
  const shipment = await getShipmentRow(shipmentId);
  if (!shipment) throw new Error("Shipment not found");
  const shipmentItems = await db
    .select()
    .from(items)
    .where(eq(items.shipmentId, shipment.id));
  if (shipmentItems.length === 0) throw new Error("Shipment has no items");

  const itemLikes: ItemLike[] = shipmentItems.map((item) => ({
    id: item.id,
    description: item.description,
    hsCode: item.hsCode,
    hsConfidence: item.hsConfidence,
    hsRationale: item.hsRationale,
    quantity: item.quantity,
    unitValue: item.unitValue,
    weightKg: item.weightKg,
    countryOfOrigin: item.countryOfOrigin,
  }));
  const document = buildCustomsPackage({
    shipment: {
      reference: shipment.reference,
      destination: shipment.destination,
      currency: shipment.currency,
      incoterms: shipment.incoterms,
      exporter: shipment.exporter,
      importer: shipment.importer,
      shippingCost: shipment.shippingCost,
      insuranceCost: shipment.insuranceCost,
    },
    items: itemLikes,
    plantedVatError: options?.plantedVatError,
  });
  const bytes = docBytes(document);
  const digest = hashBytes(bytes);

  const existing = await db
    .select()
    .from(deliverables)
    .where(eq(deliverables.shipmentId, shipment.id))
    .orderBy(desc(deliverables.version))
    .limit(1);
  const version = (existing[0]?.version ?? 0) + 1;
  const deliverableId = randomUUID();
  const revokedApprovals = await revokeActiveApprovals(
    shipment.id,
    `Superseded by version ${version}. Approval binds to the exact bytes it was given.`,
    provenance,
  );
  const claimRows = await db
    .select()
    .from(claims)
    .where(eq(claims.shipmentId, shipment.id))
    .orderBy(desc(claims.updatedAt))
    .limit(1);
  const claim = claimRows[0];
  await db
    .update(deliverables)
    .set({ state: "superseded" })
    .where(
      and(
        eq(deliverables.shipmentId, shipment.id),
        eq(deliverables.state, "active"),
      ),
    );
  const claimId = claim?.id ?? randomUUID();
  await db.insert(deliverables).values({
    id: deliverableId,
    shipmentId: shipment.id,
    claimId,
    kind: "customs-package",
    filename: `customs-package-${shipment.reference}-v${version}.json`,
    bytes,
    sha256: digest,
    mime: "application/json",
    version,
    state: "active",
  });

  const inputsHash = verificationInputsHash({ shipment, items: shipmentItems });

  if (claim) {
    await transitionClaim(claim.id, "submit", {
      deliverableId,
      verificationRunId: null,
      agentId: "agent-builder",
      inputsHash,
      tariffVersion: tariffVersionVector(shipment.destination),
      confidence: document.classification.confidence,
      rationale: document.classification.rationale,
    });
  } else {
    await db.insert(claims).values({
      id: claimId,
      shipmentId: shipment.id,
      deliverableId,
      agentId: "agent-builder",
      type: "customs-package",
      status: "submitted",
      inputsHash,
      tariffVersion: tariffVersionVector(shipment.destination),
      confidence: document.classification.confidence,
      rationale: document.classification.rationale,
    });
  }

  await db
    .update(shipments)
    .set({
      status: "awaiting-verification",
      updatedAt: new Date().toISOString(),
    })
    .where(eq(shipments.id, shipment.id));

  await db.insert(evidence).values({
    id: randomUUID(),
    shipmentId: shipment.id,
    kind: "deliverable-submitted",
    summary: `Version ${version} submitted with SHA-256 ${digest.slice(0, 16)}…`,
    detail: canonicalJSON({
      deliverableId,
      sha256: digest,
      version,
      inputsHash,
      tariffVersion: datasetVersionFor(shipment.destination),
      confidence: document.classification.confidence,
      plantedVatError: Boolean(options?.plantedVatError),
      revokedApprovals,
    }),
  });

  await appendLedger({
    shipmentId: shipment.id,
    actionName: options?.plantedVatError
      ? "builderClassifyWithPlantedError"
      : "builderClassify",
    caller: provenance.caller,
    actor: provenance.actor,
    payload: {
      deliverableId,
      version,
      sha256: digest,
      inputsHash,
      confidence: document.classification.confidence,
      revokedApprovals,
    },
    inverseAction: "retractDeliverable",
  });

  return { deliverableId, sha256: digest, version, document };
}

export const runAuditor = atomicMutation(runAuditorImpl);
async function runAuditorImpl(
  shipmentId: string,
  provenance: Provenance,
): Promise<{ findings: unknown[]; status: string }> {
  const db = getDb();
  const bundle = await getShipmentBundle(shipmentId);
  if (!bundle?.activeDeliverable || !bundle.document) {
    throw new Error("No deliverable to audit");
  }
  const document = bundle.document as unknown as CustomsDocument;
  const result = auditPackage(document);
  await db.insert(evidence).values({
    id: randomUUID(),
    shipmentId: bundle.shipment.id,
    claimId: bundle.claim?.id ?? null,
    kind: "auditor-review",
    summary:
      result.status === "issues"
        ? `Auditor found ${result.findings.length} issue(s).`
        : "Auditor found no material issues.",
    detail: canonicalJSON(result.findings),
  });
  await appendLedger({
    shipmentId: bundle.shipment.id,
    actionName: "auditorReview",
    caller: provenance.caller,
    actor: provenance.actor,
    payload: {
      deliverableId: bundle.activeDeliverable.id,
      findingIds: result.findings.map((finding) => finding.id),
      status: result.status,
    },
    inverseAction: "noop",
  });
  return { findings: result.findings, status: result.status };
}

export const runVerifier = atomicMutation(runVerifierImpl);
async function runVerifierImpl(
  shipmentId: string,
  provenance: Provenance,
): Promise<{
  runId: string;
  status: "verified" | "rejected";
  checks: VerificationCheck[];
}> {
  const db = getDb();
  const bundle = await getShipmentBundle(shipmentId);
  if (!bundle?.activeDeliverable || !bundle.claim) {
    throw new Error("No submitted deliverable to verify");
  }
  const expected = { shipment: bundle.shipment, items: bundle.items };
  const inputsHash = verificationInputsHash(expected);
  const verifiedSha256 = hashBytes(bundle.activeDeliverable.bytes);
  const result = verifyPackage({
    bytes: bundle.activeDeliverable.bytes,
    storedSha256: bundle.activeDeliverable.sha256,
    jurisdiction: bundle.shipment.destination,
    expected,
  });
  const runId = randomUUID();
  const evidenceHash = sha256(canonicalJSON(result.checks));
  await db.insert(verificationRuns).values({
    id: runId,
    shipmentId: bundle.shipment.id,
    deliverableId: bundle.activeDeliverable.id,
    status: result.status,
    checks: canonicalJSON(result.checks),
    evidenceHash,
    verifiedSha256,
    inputsHash,
    policyVersion: VERIFICATION_POLICY_VERSION,
  });
  const existingApproval = bundle.approvals.find((row) => !row.revoked);
  const preserveApproval =
    result.status === "verified" && Boolean(bundle.activeApproval);
  if (existingApproval && !preserveApproval) {
    await revokeActiveApprovals(
      bundle.shipment.id,
      "Verification invalidated the prior approval, proof binding or tariff acknowledgement.",
      provenance,
    );
  }
  await transitionClaim(
    bundle.claim.id,
    result.status === "rejected"
      ? "invalidate"
      : preserveApproval
        ? "reverifyApproved"
        : "verify",
    { verificationRunId: runId },
  );
  await db
    .update(shipments)
    .set({
      status: preserveApproval
        ? "approved"
        : result.status === "verified"
          ? "verified"
          : "verification-failed",
      updatedAt: new Date().toISOString(),
    })
    .where(eq(shipments.id, bundle.shipment.id));
  await db.insert(evidence).values({
    id: randomUUID(),
    shipmentId: bundle.shipment.id,
    claimId: bundle.claim.id,
    kind: "verification",
    summary:
      result.status === "verified"
        ? `Verifier passed ${result.checks.filter((check) => check.status === "pass").length} checks.`
        : `Verifier rejected the package. ${result.checks.filter((check) => check.status === "fail").length} check(s) failed.`,
    detail: canonicalJSON({
      runId,
      evidenceHash,
      verifiedSha256,
      inputsHash,
      policyVersion: VERIFICATION_POLICY_VERSION,
      checks: result.checks,
    }),
  });
  await appendLedger({
    shipmentId: bundle.shipment.id,
    actionName: "verifierCheck",
    caller: provenance.caller,
    actor: provenance.actor,
    payload: {
      runId,
      deliverableId: bundle.activeDeliverable.id,
      deliverableSha256: bundle.activeDeliverable.sha256,
      status: result.status,
      evidenceHash,
      verifiedSha256,
      inputsHash,
      policyVersion: VERIFICATION_POLICY_VERSION,
      failed: result.checks
        .filter((check) => check.status === "fail")
        .map((check) => check.id),
    },
    inverseAction: "invalidateVerification",
  });
  return { runId, status: result.status, checks: result.checks };
}

export const approveDeliverable = atomicMutation(approveDeliverableImpl);
async function approveDeliverableImpl(
  input: {
    shipmentId: string;
    deliverableId: string;
    approverId?: string | null;
    approverKind: "human" | "agent";
    acknowledgeTariffBaseLevel?: boolean;
  },
  provenance: Provenance,
): Promise<{ approvalId: string; boundHash: string }> {
  const db = getDb();
  if (input.approverKind !== "human") {
    throw new Error(
      "Agents cannot approve work. A human operator must approve.",
    );
  }
  const identity = evaluateHumanReview({
    caller: provenance.caller,
    authenticatedApprover: provenance.authenticatedApprover,
    requestedApprover: input.approverId,
  });
  if (!identity.allowed || !identity.approverId)
    throw new Error(identity.reason);
  const approverAgent = identity.approverId
    ? await db
        .select()
        .from(agents)
        .where(eq(agents.id, identity.approverId))
        .limit(1)
    : [];
  if (approverAgent[0]?.kind === "agent") {
    throw new Error(
      "Agents cannot approve work. A human operator must approve.",
    );
  }
  const bundle = await getShipmentBundle(input.shipmentId);
  if (!bundle) throw new Error("Shipment not found");
  const deliverableRow = await db
    .select()
    .from(deliverables)
    .where(eq(deliverables.id, input.deliverableId))
    .limit(1);
  const deliverable = deliverableRow[0];
  if (!deliverable) throw new Error("Deliverable not found");
  if (deliverable.shipmentId !== bundle.shipment.id) {
    throw new Error("Deliverable does not belong to this shipment");
  }
  if (deliverable.state !== "active") {
    throw new Error("Only the active deliverable version can be approved");
  }
  if (!bundle.claim) {
    throw new Error("Shipment has no claim to approve");
  }
  if (bundle.activeDeliverable?.id !== deliverable.id)
    throw new Error("Deliverable is not the claim's current artifact");
  const currentHash = hashBytes(deliverable.bytes);
  const hashMatches = currentHash === deliverable.sha256;
  const baseLevelCodes = bundle.tariffRequirements.unconfirmedCodes;
  const expected = { shipment: bundle.shipment, items: bundle.items };
  const binding = {
    shipmentId: bundle.shipment.id,
    deliverableId: deliverable.id,
    sha256: currentHash,
    inputsHash: verificationInputsHash(expected),
  };
  const verifiedRun = bundle.lastVerification;
  const fresh = verifyPackage({
    bytes: deliverable.bytes,
    storedSha256: deliverable.sha256,
    jurisdiction: bundle.shipment.destination,
    expected,
  });
  const verificationPassed =
    bundle.chain.valid &&
    proofMatches(verifiedRun, binding) &&
    proofWasRecorded(verifiedRun, bundle.ledger) &&
    fresh.status === "verified" &&
    verifiedRun?.evidenceHash === sha256(canonicalJSON(fresh.checks));
  const existingApproval = bundle.approvals.find(
    (row) => row.deliverableId === deliverable.id && !row.revoked,
  );
  const existingProofMatches = Boolean(
    existingApproval &&
    existingApproval.approverKind === "human" &&
    existingApproval.approvedSha256 === currentHash &&
    approvalWasRecorded(existingApproval, bundle.ledger) &&
    proofMatches(
      bundle.verificationRuns.find(
        (run) => run.id === existingApproval.verificationRunId,
      ),
      binding,
    ) &&
    proofWasRecorded(
      bundle.verificationRuns.find(
        (run) => run.id === existingApproval.verificationRunId,
      ),
      bundle.ledger,
    ),
  );
  const decision = evaluateApproval({
    approverKind: input.approverKind,
    approverRecordedKind: approverAgent[0]?.kind ?? null,
    hashMatches,
    claimStatus: bundle.claim?.status ?? "missing",
    deliverableIsCurrent: bundle.claim?.deliverableId === deliverable.id,
    verificationPassed,
    hasActiveApproval: Boolean(existingApproval),
    tariffResolutionComplete: bundle.tariffRequirements.resolved,
    activeApprovalHashMatches: existingProofMatches,
    activeApprovalTariffAcknowledged: Boolean(
      existingApproval && storedConsentCovers(existingApproval, baseLevelCodes),
    ),
    caller: provenance.caller,
    authenticatedApprover: provenance.authenticatedApprover ?? null,
    requestedApprover: input.approverId ?? null,
    unconfirmedTariffCodes: baseLevelCodes,
    tariffBaseLevelAcknowledged: Boolean(input.acknowledgeTariffBaseLevel),
  });
  if (!decision.allowed) {
    const invalidExisting =
      existingApproval &&
      (!existingProofMatches ||
        !storedConsentCovers(existingApproval, baseLevelCodes));
    if (
      !hashMatches ||
      invalidExisting ||
      ((!verificationPassed || !bundle.tariffRequirements.resolved) &&
        (existingApproval ||
          bundle.claim.status === "verified" ||
          bundle.claim.status === "human-approved"))
    ) {
      await revokeActiveApprovals(
        bundle.shipment.id,
        decision.reason,
        provenance,
      );
      await transitionClaim(bundle.claim.id, "invalidate", {
        verificationRunId: null,
      });
      await db
        .update(shipments)
        .set({
          status: "awaiting-verification",
          updatedAt: new Date().toISOString(),
        })
        .where(eq(shipments.id, bundle.shipment.id));
      await appendLedger({
        shipmentId: bundle.shipment.id,
        actionName: "invalidateVerification",
        caller: provenance.caller,
        actor: provenance.actor,
        payload: {
          deliverableId: deliverable.id,
          verificationRunId: bundle.claim.verificationRunId,
          reason: decision.reason,
        },
        inverseAction: "noop",
      });
      throw new RevocationRefusal(decision.reason);
    }
    throw new Error(decision.reason);
  }
  if (existingApproval) {
    return {
      approvalId: existingApproval.id,
      boundHash: existingApproval.approvedSha256,
    };
  }

  const effectiveApproverId = identity.approverId;
  if (!verifiedRun) throw new Error("Current verification is required");

  const approvalId = randomUUID();
  const baseLevelAcknowledged =
    baseLevelCodes.length > 0 && Boolean(input.acknowledgeTariffBaseLevel);
  await db.insert(approvals).values({
    id: approvalId,
    deliverableId: deliverable.id,
    shipmentId: bundle.shipment.id,
    approverId: effectiveApproverId,
    approverKind: "human",
    approvedSha256: deliverable.sha256,
    verificationRunId: verifiedRun.id,
    tariffBaseLevelAcknowledged: baseLevelAcknowledged,
    tariffBaseLevelCodes:
      baseLevelCodes.length > 0 ? baseLevelCodes.join(", ") : null,
  });
  await transitionClaim(bundle.claim.id, "approve");
  await db
    .update(shipments)
    .set({ status: "approved", updatedAt: new Date().toISOString() })
    .where(eq(shipments.id, bundle.shipment.id));
  await db.insert(evidence).values({
    id: randomUUID(),
    shipmentId: bundle.shipment.id,
    claimId: bundle.claim.id,
    kind: "human-approval",
    summary: `Human approval bound to ${deliverable.sha256.slice(0, 16)}…`,
    detail: canonicalJSON({
      approvalId,
      approverId: effectiveApproverId,
      approvedSha256: deliverable.sha256,
      verificationRunId: verifiedRun.id,
      tariffBaseLevelAcknowledged: baseLevelAcknowledged,
      tariffBaseLevelCodes: baseLevelCodes,
    }),
  });
  await appendLedger({
    shipmentId: bundle.shipment.id,
    actionName: "approveDeliverable",
    caller: provenance.caller,
    actor: provenance.actor,
    payload: {
      approvalId,
      deliverableId: deliverable.id,
      approvedSha256: deliverable.sha256,
      verificationRunId: verifiedRun.id,
      approverId: effectiveApproverId,
      tariffBaseLevelAcknowledged: baseLevelAcknowledged,
      tariffBaseLevelCodes: baseLevelCodes,
    },
    inverseAction: "revokeApproval",
  });
  return { approvalId, boundHash: deliverable.sha256 };
}

export const revokeActiveApprovals = atomicMutation(revokeActiveApprovalsImpl);
async function revokeActiveApprovalsImpl(
  shipmentId: string,
  reason: string,
  provenance: Provenance,
): Promise<number> {
  const db = getDb();
  const active = await db
    .select()
    .from(approvals)
    .where(
      and(eq(approvals.shipmentId, shipmentId), eq(approvals.revoked, false)),
    );
  if (active.length === 0) return 0;
  const now = new Date().toISOString();
  await db
    .update(approvals)
    .set({ revoked: true, revokedReason: reason, revokedAt: now })
    .where(
      and(eq(approvals.shipmentId, shipmentId), eq(approvals.revoked, false)),
    );
  const claimRows = await db
    .select()
    .from(claims)
    .where(eq(claims.shipmentId, shipmentId))
    .orderBy(desc(claims.updatedAt))
    .limit(1);
  if (claimRows[0]) {
    await transitionClaim(
      claimRows[0].id,
      claimRows[0].deliverableId ? "invalidate" : "clear",
      { verificationRunId: null },
    );
  }
  await db
    .update(shipments)
    .set({ status: "approval-revoked", updatedAt: now })
    .where(eq(shipments.id, shipmentId));
  await appendLedger({
    shipmentId,
    actionName: "revokeApproval",
    caller: provenance.caller,
    actor: provenance.actor,
    payload: { reason, revokedApprovalIds: active.map((row) => row.id) },
    inverseAction: "noop",
  });
  return active.length;
}

export const tamperDeliverable = atomicMutation(tamperDeliverableImpl);
async function tamperDeliverableImpl(
  shipmentId: string,
  provenance: Provenance,
): Promise<{
  detected: boolean;
  expectedHash: string;
  actualHash: string;
  revokedApprovals: number;
}> {
  const db = getDb();
  const bundle = await getShipmentBundle(shipmentId);
  if (!bundle?.activeDeliverable || !bundle.document) {
    throw new Error("No deliverable to tamper with");
  }
  const document = bundle.document as unknown as CustomsDocument;
  const tampered = {
    ...document,
    totals: {
      ...document.totals,
      vat: round2(document.totals.vat + 1.23),
      landedCost: round2(document.totals.landedCost + 1.23),
    },
  };
  const tamperedBytes = canonicalJSON(tampered);
  await db
    .update(deliverables)
    .set({ bytes: tamperedBytes })
    .where(eq(deliverables.id, bundle.activeDeliverable.id));
  const actualHash = hashBytes(tamperedBytes);
  const expectedHash = bundle.activeDeliverable.sha256;
  const detected = actualHash !== expectedHash;
  let revokedApprovals = 0;
  if (detected) {
    revokedApprovals = await revokeActiveApprovals(
      bundle.shipment.id,
      `Hash mismatch: stored bytes ${actualHash.slice(0, 16)}… do not match approved ${expectedHash.slice(0, 16)}…`,
      provenance,
    );
    if (bundle.claim)
      await transitionClaim(bundle.claim.id, "invalidate", {
        verificationRunId: null,
      });
    await db
      .update(shipments)
      .set({ status: "tampered", updatedAt: new Date().toISOString() })
      .where(eq(shipments.id, bundle.shipment.id));
  }
  await db.insert(evidence).values({
    id: randomUUID(),
    shipmentId: bundle.shipment.id,
    claimId: bundle.claim?.id ?? null,
    kind: "tamper-detected",
    summary: detected
      ? "Out-of-band edit detected. Approval revoked and claim returned to verification."
      : "No tamper detected.",
    detail: canonicalJSON({ expectedHash, actualHash, revokedApprovals }),
  });
  await appendLedger({
    shipmentId: bundle.shipment.id,
    actionName: "tamperDetected",
    caller: provenance.caller,
    actor: provenance.actor,
    payload: {
      deliverableId: bundle.activeDeliverable.id,
      expectedHash,
      actualHash,
      revokedApprovals,
    },
    inverseAction: "noop",
  });
  return { detected, expectedHash, actualHash, revokedApprovals };
}

export const repairDeliverable = atomicMutation(repairDeliverableImpl);
async function repairDeliverableImpl(
  shipmentId: string,
  provenance: Provenance,
): Promise<{ deliverableId: string; sha256: string; version: number }> {
  const bundle = await getShipmentBundle(shipmentId);
  if (!bundle) throw new Error("Shipment not found");
  const built = await runBuilder(shipmentId, provenance);
  await appendLedger({
    shipmentId: bundle.shipment.id,
    actionName: "repairDeliverable",
    caller: provenance.caller,
    actor: provenance.actor,
    payload: {
      deliverableId: built.deliverableId,
      version: built.version,
      sha256: built.sha256,
      repairedFrom: bundle.activeDeliverable?.id ?? null,
    },
    inverseAction: "retractDeliverable",
  });
  return {
    deliverableId: built.deliverableId,
    sha256: built.sha256,
    version: built.version,
  };
}

export const forkShipment = atomicMutation(forkShipmentImpl);
async function forkShipmentImpl(
  input: {
    shipmentId: string;
    destination: string;
    currency?: string | undefined;
  },
  provenance: Provenance,
): Promise<{ forkId: string; reference: string; landedCost: number }> {
  const db = getDb();
  const source = await getShipmentBundle(input.shipmentId);
  if (!source) throw new Error("Shipment not found");
  const created = await createShipment(
    {
      destination: input.destination,
      currency: input.currency ?? source.shipment.currency,
      origin: source.shipment.origin,
      incoterms: source.shipment.incoterms,
      exporter: source.shipment.exporter,
      importer: source.shipment.importer,
      shippingCost: source.shipment.shippingCost,
      insuranceCost: source.shipment.insuranceCost,
      notes: `Forked from ${source.shipment.reference}. Destination-dependent values recomputed.`,
      forkedFrom: source.shipment.id,
      source: provenance.caller,
      items: source.items.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unitValue: item.unitValue,
        hsCode: item.hsCode,
        weightKg: item.weightKg,
        countryOfOrigin: item.countryOfOrigin,
        currency: item.currency,
      })),
    },
    provenance,
  );
  await runBuilder(created.id, provenance);
  await runAuditor(created.id, provenance);
  const verified = await runVerifier(created.id, provenance);
  const forkBundle = await getShipmentBundle(created.id);
  const document = forkBundle?.document as unknown as CustomsDocument | null;
  await appendLedger({
    shipmentId: source.shipment.id,
    actionName: "forkShipment",
    caller: provenance.caller,
    actor: provenance.actor,
    payload: {
      source: source.shipment.id,
      fork: created.id,
      destination: input.destination,
      verification: verified.status,
    },
    inverseAction: "archiveFork",
  });
  return {
    forkId: created.id,
    reference: created.reference,
    landedCost: document?.totals.landedCost ?? 0,
  };
}

export const rewindShipment = atomicMutation(rewindShipmentImpl);
async function rewindShipmentImpl(
  input: { shipmentId: string; toLedgerId: number },
  provenance: Provenance,
): Promise<{ rewoundTo: number; applied: string[]; revokedApprovals: number }> {
  const db = getDb();
  const bundle = await getShipmentBundle(input.shipmentId);
  if (!bundle) throw new Error("Shipment not found");
  const plan = planRewind(bundle.ledger, input.toLedgerId);
  if (!plan.valid) {
    throw new Error("Target ledger entry does not belong to this shipment");
  }
  if (!bundle.chain.valid)
    throw new Error("Cannot rewind a broken evidence chain");
  const last = bundle.ledger[bundle.ledger.length - 1];
  const lastData = parseJson<{ data?: { rewoundTo?: number } }>(
    last?.payload,
    {},
  ).data;
  if (
    last?.actionName === "rewindShipment" &&
    lastData?.rewoundTo === input.toLedgerId &&
    !bundle.claim?.verificationRunId &&
    !bundle.approvals.some((row) => !row.revoked)
  ) {
    return { rewoundTo: input.toLedgerId, applied: [], revokedApprovals: 0 };
  }
  const reason = `Rewound to ledger entry ${input.toLedgerId}`;
  const revokedApprovals = await revokeActiveApprovals(
    bundle.shipment.id,
    reason,
    provenance,
  );
  const applied: string[] = revokedApprovals ? ["revokeApproval"] : [];
  const retractedDeliverableIds = new Set<string>();
  const now = new Date().toISOString();
  const submissions = new Set([
    "submitDeliverable",
    "builderClassify",
    "builderClassifyWithPlantedError",
  ]);
  let candidateId: string | null = null;
  for (const entry of bundle.ledger.filter(
    (row) => row.id <= input.toLedgerId,
  )) {
    const data = parseJson<{
      data?: { deliverableId?: string; restoredDeliverableId?: string | null };
    }>(entry.payload, {}).data;
    if (submissions.has(entry.actionName))
      candidateId = data?.deliverableId ?? null;
    if (entry.actionName === "rewindShipment")
      candidateId = data?.restoredDeliverableId ?? null;
  }
  for (const entry of [...plan.entries].reverse()) {
    const data = parseJson<{
      data?: {
        deliverableId?: string;
        fork?: string;
        draftId?: string;
        proposalId?: string;
        missionId?: string;
      };
    }>(entry.payload, {}).data;
    if (submissions.has(entry.actionName) && data?.deliverableId) {
      retractedDeliverableIds.add(data.deliverableId);
    } else if (entry.actionName === "forkShipment" && data?.fork) {
      const fork = await getShipmentRow(data.fork);
      if (fork && fork.status !== "archived") {
        await revokeActiveApprovals(fork.id, reason, provenance);
        await archiveShipment(fork.id, provenance);
        applied.push("archiveFork");
      }
    } else if (
      ["draftCourierEmail", "approveCourierDraft", "sendCourierEmail"].includes(
        entry.actionName,
      ) &&
      data?.draftId
    ) {
      const updated = await db
        .update(courierDrafts)
        .set({ status: "retracted", approvedBy: null, approvedSha256: null })
        .where(
          and(
            eq(courierDrafts.id, data.draftId),
            eq(courierDrafts.shipmentId, bundle.shipment.id),
          ),
        )
        .returning();
      if (updated.length) applied.push("retractOutreach");
    } else if (
      [
        "proposeAction",
        "reviewProposedAction",
        "approveProposedAction",
      ].includes(entry.actionName) &&
      data?.proposalId
    ) {
      const updated = await db
        .update(proposedActions)
        .set({ status: "rejected", runtimeLoad: false })
        .where(
          and(
            eq(proposedActions.id, data.proposalId),
            eq(proposedActions.shipmentId, bundle.shipment.id),
          ),
        )
        .returning();
      if (updated.length) applied.push("rejectProposal");
    } else if (entry.actionName === "architectPlan" && data?.missionId) {
      await db
        .update(missions)
        .set({ status: "closed" })
        .where(eq(missions.id, data.missionId));
      await db
        .update(tasks)
        .set({ status: "cancelled" })
        .where(eq(tasks.missionId, data.missionId));
      applied.push("closeMission");
    }
  }
  const rows = await db
    .select()
    .from(deliverables)
    .where(eq(deliverables.shipmentId, bundle.shipment.id));
  const restored = rows.find(
    (row) => row.id === candidateId && hashBytes(row.bytes) === row.sha256,
  );
  // Deactivate first so the unique active-version constraint holds throughout.
  await db
    .update(deliverables)
    .set({ state: "superseded" })
    .where(
      and(
        eq(deliverables.shipmentId, bundle.shipment.id),
        eq(deliverables.state, "active"),
      ),
    );
  if (retractedDeliverableIds.size) {
    await db
      .update(deliverables)
      .set({ state: "retracted" })
      .where(
        and(
          eq(deliverables.shipmentId, bundle.shipment.id),
          inArray(deliverables.id, [...retractedDeliverableIds]),
        ),
      );
    applied.push("retractDeliverable");
  }
  if (restored) {
    await db
      .update(deliverables)
      .set({ state: "active" })
      .where(eq(deliverables.id, restored.id));
    if (bundle.activeDeliverable?.id !== restored.id)
      applied.push("restoreDeliverable");
  }
  if (bundle.claim) {
    await transitionClaim(bundle.claim.id, restored ? "submit" : "clear", {
      deliverableId: restored?.id ?? null,
      verificationRunId: null,
    });
    if (bundle.claim.verificationRunId) applied.push("invalidateVerification");
  }
  await db
    .update(shipments)
    .set({ status: "rewound", updatedAt: now })
    .where(eq(shipments.id, bundle.shipment.id));
  const detail = {
    rewoundTo: input.toLedgerId,
    restoredDeliverableId: restored?.id ?? null,
    retractedDeliverableIds: [...retractedDeliverableIds],
    invalidatedVerificationRunId: bundle.claim?.verificationRunId ?? null,
    applied: [...new Set(applied)],
    revokedApprovals,
  };
  await db.insert(evidence).values({
    id: randomUUID(),
    shipmentId: bundle.shipment.id,
    claimId: bundle.claim?.id ?? null,
    kind: "rewind",
    summary: `Rewound to ledger entry ${input.toLedgerId}. Historical evidence preserved; fresh verification required.`,
    detail: canonicalJSON(detail),
  });
  await appendLedger({
    shipmentId: bundle.shipment.id,
    actionName: "rewindShipment",
    caller: provenance.caller,
    actor: provenance.actor,
    payload: detail,
    inverseAction: "rewindShipment",
  });
  return {
    rewoundTo: input.toLedgerId,
    applied: detail.applied,
    revokedApprovals,
  };
}

export const spawnSpecialist = atomicMutation(spawnSpecialistImpl);
async function spawnSpecialistImpl(
  input: { role: string; country: string },
  provenance: Provenance,
): Promise<{ agentId: string }> {
  const db = getDb();
  const agentId = `desk-${input.role}-${input.country}`;
  await db
    .insert(agents)
    .values({
      id: agentId,
      kind: "agent",
      role: input.role,
      country: input.country,
      displayName: `${input.role} · ${input.country}`,
    })
    .onConflictDoNothing();
  await appendLedger({
    shipmentId: "workspace",
    actionName: "spawnSpecialist",
    caller: provenance.caller,
    actor: provenance.actor,
    payload: { agentId, role: input.role, country: input.country },
    inverseAction: "retireAgent",
  });
  return { agentId };
}

export const exportShipmentManifest = snapshotQuery(exportShipmentManifestImpl);
async function exportShipmentManifestImpl(
  shipmentId: string,
): Promise<ShipmentManifest> {
  const db = getDb();
  const bundle = await getShipmentBundle(shipmentId);
  if (!bundle) throw new Error("Shipment not found");
  const allEntries = await ledgerEntries();
  const documentRows = await db
    .select()
    .from(deliverables)
    .where(eq(deliverables.shipmentId, bundle.shipment.id))
    .orderBy(deliverables.version);
  const documents = documentRows.map((row) => ({
    id: row.id,
    filename: row.filename,
    version: row.version,
    state: row.state,
    mime: row.mime,
    sha256: row.sha256,
    recomputedSha256: hashBytes(row.bytes),
    hashMatches: hashBytes(row.bytes) === row.sha256,
    byteLength: Buffer.byteLength(row.bytes, "utf8"),
    bytes: row.bytes,
    createdAt: new Date(row.createdAt).toISOString(),
  }));
  const { shipment } = bundle;
  const inputs = {
    shipment: {
      reference: shipment.reference,
      destination: shipment.destination,
      currency: shipment.currency,
      incoterms: shipment.incoterms,
      exporter: shipment.exporter,
      importer: shipment.importer,
      shippingCost: shipment.shippingCost,
      insuranceCost: shipment.insuranceCost,
    },
    items: bundle.items.map((item) => ({
      id: item.id,
      description: item.description,
      hsCode: item.hsCode,
      hsConfidence: item.hsConfidence,
      hsRationale: item.hsRationale,
      quantity: item.quantity,
      unitValue: item.unitValue,
      currency: item.currency,
      weightKg: item.weightKg,
      countryOfOrigin: item.countryOfOrigin,
    })),
  };
  return manifestSchema.parse({
    manifestVersion: 2,
    exportId: randomUUID(),
    exportedAt: new Date().toISOString(),
    shipment: {
      id: shipment.id,
      reference: shipment.reference,
      destination: shipment.destination,
      currency: shipment.currency,
      status: shipment.status,
      forkedFrom: shipment.forkedFrom,
    },
    inputs,
    inputsHash: verificationInputsHash(inputs),
    claim: bundle.claim
      ? {
          id: bundle.claim.id,
          status: bundle.claim.status,
          deliverableId: bundle.claim.deliverableId,
          verificationRunId: bundle.claim.verificationRunId,
        }
      : null,
    effectiveApprovalId: bundle.activeApproval?.id ?? null,
    documents,
    historicalMismatches: documents.filter(
      (row) => row.state !== "active" && !row.hashMatches,
    ).length,
    verificationRuns: bundle.verificationRuns.map((row) => ({
      ...row,
      createdAt: new Date(row.createdAt).toISOString(),
    })),
    approvals: bundle.approvals.map((row) => ({
      ...row,
      createdAt: new Date(row.createdAt).toISOString(),
      revokedAt: row.revokedAt ? new Date(row.revokedAt).toISOString() : null,
    })),
    ledger: {
      entries: allEntries.length,
      shipmentEntries: bundle.ledger.length,
      shipmentEntryIds: bundle.ledger.map((row) => row.id),
      finalHash: allEntries[allEntries.length - 1]?.entryHash ?? "GENESIS",
      chainValid: checkChain(allEntries).valid,
      rows: allEntries.map((row) => ({
        ...row,
        createdAt: new Date(row.createdAt).toISOString(),
      })),
    },
    disclaimer:
      "ESTIMATE — NOT LEGAL ADVICE. Confirm current tariffs with the destination customs authority. The hash chain records attribution; authenticity requires an independently retained ledger tip.",
  });
}

export const resetWorkspace = atomicMutation(resetWorkspaceImpl);
async function resetWorkspaceImpl(): Promise<void> {
  const db = getDb();
  await db.delete(courierDrafts);
  await db.delete(proposedActions);
  await db.delete(evidence);
  await db.delete(verificationRuns);
  await db.delete(approvals);
  await db.delete(claims);
  await db.delete(deliverables);
  await db.delete(tasks);
  await db.delete(missions);
  await db.delete(items);
  await db.delete(ledger);
  await db
    .update(ledgerHead)
    .set({ tipId: 0, tipHash: "GENESIS" })
    .where(eq(ledgerHead.id, "global"));
  await db.delete(shipments);
  await db.delete(tariffRows);
  await db.delete(agents);
}

export const installTariffSnapshot = atomicMutation(installTariffSnapshotImpl);
async function installTariffSnapshotImpl(): Promise<number> {
  const { TARIFF_DATA } = await import("./tariffs.js");
  const db = getDb();
  await db.delete(tariffRows);
  let count = 0;
  for (const row of TARIFF_DATA) {
    await db.insert(tariffRows).values({
      id: `${row.jurisdiction}-${row.hsCode}`,
      jurisdiction: row.jurisdiction,
      hsCode: row.hsCode,
      description: row.description,
      dutyRate: row.dutyRate,
      vatRate: row.vatRate,
      source: row.source,
      sourceVersion: row.sourceVersion,
      sourceUrl: row.sourceUrl,
      effectiveFrom: row.effectiveFrom,
      fetchedAt: row.fetchedAt,
      datasetVersion: row.datasetVersion,
      codeLevel: row.codeLevel,
      nationalSuffixUnconfirmed: row.nationalSuffixUnconfirmed,
      notes: row.notes ?? null,
    });
    count += 1;
  }
  return count;
}

export const archiveShipment = atomicMutation(archiveShipmentImpl);
async function archiveShipmentImpl(
  shipmentId: string,
  provenance: Provenance,
): Promise<void> {
  const db = getDb();
  await db
    .update(shipments)
    .set({ status: "archived", updatedAt: new Date().toISOString() })
    .where(eq(shipments.id, shipmentId));
  await appendLedger({
    shipmentId,
    actionName: "archiveShipment",
    caller: provenance.caller,
    actor: provenance.actor,
    payload: { shipmentId },
    inverseAction: "noop",
  });
}

export async function ledgerRowsFor(shipmentIds: string[]) {
  if (shipmentIds.length === 0) return [];
  const db = getDb();
  return db
    .select()
    .from(ledger)
    .where(inArray(ledger.shipmentId, shipmentIds))
    .orderBy(ledger.id);
}

export async function countRows(): Promise<number> {
  const db = getDb();
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(shipments);
  return result[0]?.count ?? 0;
}

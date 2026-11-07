import { randomUUID } from "node:crypto";

import { and, desc, eq } from "drizzle-orm";

import type { CustomsDocument } from "../../shared/alora-types.js";
import { getDb } from "../db/index.js";
import {
  agents,
  claims,
  courierDrafts,
  deliverables,
  evidence,
  items,
  ledger,
  missions,
  proposedActions,
  shipments,
  tariffRows,
  tasks,
  verificationRuns,
} from "../db/schema.js";
import {
  approveDeliverable,
  createShipment,
  ensureAgents,
  installTariffSnapshot,
  repairDeliverable,
  resetWorkspace,
  revokeActiveApprovals,
  runArchitect,
  runAuditor,
  runBuilder,
  runVerifier,
  type Provenance,
} from "./commands.js";
import { classifyDescription, round2 } from "./document.js";
import { canonicalJSON, hashBytes } from "./hash.js";
import { appendLedger, ledgerEntries } from "./ledger.js";
import { evaluateHumanReview, evaluateTemplateReview } from "./policy.js";
import { getShipmentBundle } from "./queries.js";
import { atomicMutation, RevocationRefusal } from "./transactions.js";

export const seedDemo = atomicMutation(seedDemoImpl);
async function seedDemoImpl(provenance: Provenance): Promise<{
  shipmentId: string;
  reference: string;
  verification: string;
  failedChecks: string[];
  ledgerEntries: number;
}> {
  const db = getDb();
  await resetWorkspace();
  await appendLedger({
    shipmentId: "workspace",
    actionName: "resetDemo",
    caller: provenance.caller,
    actor: provenance.actor,
    payload: { mode: "seed-demo" },
    inverseAction: "noop",
  });
  await db.delete(proposedActions);
  await db.delete(courierDrafts);
  await installTariffSnapshot();
  await ensureAgents();

  const created = await createShipment(
    {
      reference: "DE-2026-001",
      destination: "DE",
      currency: "EUR",
      origin: "CN",
      incoterms: "CIF",
      exporter: "Shenzhen Alora Trading Co., Ltd.",
      importer: "Northline Imports GmbH",
      shippingCost: 420,
      insuranceCost: 85,
      notes:
        "Seeded flagship shipment. A €4.20 VAT under-declaration is planted in version 1 so the Auditor and Verifier can catch it.",
      source: "seed",
      items: [
        {
          description: "Industrial network router, 4-port, model AR-4",
          quantity: 24,
          unitValue: 185,
          hsCode: "85176200",
          weightKg: 1.8,
          countryOfOrigin: "CN",
        },
        {
          description: "Cotton T-shirts, printed, crew neck",
          quantity: 120,
          unitValue: 12.5,
          hsCode: "61091000",
          weightKg: 0.2,
          countryOfOrigin: "CN",
        },
      ],
    },
    { caller: "seed", actor: "seed@alora.local" },
  );
  await runArchitect(created.id, { caller: "seed", actor: "seed@alora.local" });
  await runBuilder(
    created.id,
    { caller: "seed", actor: "seed@alora.local" },
    { plantedVatError: true },
  );
  await runAuditor(created.id, { caller: "seed", actor: "seed@alora.local" });
  const verified = await runVerifier(created.id, {
    caller: "seed",
    actor: "seed@alora.local",
  });
  await db.insert(evidence).values({
    id: randomUUID(),
    shipmentId: created.id,
    kind: "demo-metadata",
    summary:
      "Demo has one planted error: the VAT total is €4.20 below the sum of the line VAT.",
    detail: canonicalJSON({
      plantedError: "vat-total-understated-by-4.20",
      visibleToBuilder: false,
      visibleToVerifier: false,
      expectedVerification: "rejected",
    }),
  });
  const entries = await ledgerEntries(created.id);
  return {
    shipmentId: created.id,
    reference: created.reference,
    verification: verified.status,
    failedChecks: verified.checks
      .filter((entry) => (entry as { status?: string }).status === "fail")
      .map((entry) => (entry as { id?: string }).id ?? "unknown"),
    ledgerEntries: entries.length,
  };
}

export interface IntakeDraft {
  items: Array<{
    description: string;
    quantity: number;
    unitValue: number;
    hsCode: string | null;
    hsConfidence: number;
    hsRationale: string;
  }>;
  unparsedLines: string[];
}

export function parseIntake(text: string): IntakeDraft {
  const items: IntakeDraft["items"] = [];
  const unparsedLines: string[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || /^(description|item|qty|quantity)\b/i.test(line)) continue;
    let match =
      /^(\d+(?:\.\d+)?)\s*[x×]\s*(.+?)\s*(?:@|at)\s*[\$€£]?\s*(\d+(?:[.,]\d+)?)/i.exec(
        line,
      );
    if (!match) {
      const parts = line.split(/\t|\s*\|\s*|\s{2,}/).filter(Boolean);
      if (parts.length >= 3) {
        match = [
          line,
          parts[0] ?? "",
          parts[1] ?? "",
          parts[2] ?? "",
        ] as unknown as RegExpExecArray;
      }
    }
    if (!match) {
      unparsedLines.push(line);
      continue;
    }
    const quantity = Number(match[1]);
    const description = (match[2] ?? "").trim();
    const unitValue = Number((match[3] ?? "0").replace(",", "."));
    if (
      !Number.isFinite(quantity) ||
      !Number.isFinite(unitValue) ||
      quantity <= 0 ||
      unitValue <= 0 ||
      !description
    ) {
      unparsedLines.push(line);
      continue;
    }
    const proposed = classifyDescription(description);
    items.push({
      description,
      quantity: Math.round(quantity),
      unitValue: round2(unitValue),
      hsCode: proposed.hsCode,
      hsConfidence: proposed.confidence,
      hsRationale: proposed.rationale,
    });
  }
  return { items, unparsedLines };
}

export const createIntakeShipment = atomicMutation(createIntakeShipmentImpl);
async function createIntakeShipmentImpl(
  input: {
    text: string;
    destination: string;
    currency: string;
    shippingCost: number;
    insuranceCost: number;
  },
  provenance: Provenance,
): Promise<{ draft: IntakeDraft; shipmentId: string; reference: string }> {
  const draft = parseIntake(input.text);
  if (draft.items.length === 0) {
    throw new Error(
      "No line items could be extracted. Use '2 x router @ 185'.",
    );
  }
  const created = await createShipment(
    {
      destination: input.destination,
      currency: input.currency,
      origin: "CN",
      shippingCost: input.shippingCost,
      insuranceCost: input.insuranceCost,
      notes:
        "Created from a deterministic intake draft. Human confirmation required.",
      source: "intake",
      items: draft.items.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unitValue: item.unitValue,
        hsCode: item.hsCode,
        countryOfOrigin: "CN",
        weightKg: 0,
      })),
    },
    provenance,
  );
  return { draft, shipmentId: created.id, reference: created.reference };
}

export const draftCourierEmail = atomicMutation(draftCourierEmailImpl);
async function draftCourierEmailImpl(
  input: { shipmentId: string; courier: string },
  provenance: Provenance,
): Promise<{ draftId: string; sha256: string; subject: string; body: string }> {
  const db = getDb();
  const bundle = await getShipmentBundle(input.shipmentId);
  if (!bundle) throw new Error("Shipment not found");
  const document = bundle.document as unknown as CustomsDocument | null;
  const landed = document?.totals.landedCost ?? 0;
  const subject = `Quote request ${bundle.shipment.reference} → ${bundle.shipment.destination}`;
  const body = [
    `Hello ${input.courier},`,
    "",
    `Please quote carriage for shipment ${bundle.shipment.reference} to ${bundle.shipment.destination}.`,
    `Incoterms: ${bundle.shipment.incoterms}. Declared goods value: ${bundle.shipment.currency} ${document?.totals.goodsValue ?? 0}.`,
    `Estimated landed cost: ${bundle.shipment.currency} ${landed}.`,
    "",
    "We will not release this shipment until a human approves the verified customs package.",
    "",
    "Regards,",
    "Alora Operations",
    "",
    "ESTIMATE — NOT LEGAL ADVICE.",
  ].join("\n");
  const digest = hashBytes(subject + "\n" + body);
  const draftId = randomUUID();
  await db.insert(courierDrafts).values({
    id: draftId,
    shipmentId: bundle.shipment.id,
    courier: input.courier,
    subject,
    body,
    sha256: digest,
    status: "draft",
  });
  await db.insert(evidence).values({
    id: randomUUID(),
    shipmentId: bundle.shipment.id,
    kind: "outreach-draft",
    summary: `Draft for ${input.courier} created. Nothing sent.`,
    detail: canonicalJSON({ draftId, sha256: digest, courier: input.courier }),
  });
  await appendLedger({
    shipmentId: bundle.shipment.id,
    actionName: "draftCourierEmail",
    caller: provenance.caller,
    actor: provenance.actor,
    payload: { draftId, courier: input.courier, sha256: digest },
    inverseAction: "retractOutreach",
  });
  return { draftId, sha256: digest, subject, body };
}

export const approveCourierDraft = atomicMutation(approveCourierDraftImpl);
async function approveCourierDraftImpl(
  input: {
    draftId: string;
    approverId?: string | null | undefined;
    approverKind: string;
  },
  provenance: Provenance,
): Promise<{ approved: boolean; boundHash: string; approverId: string }> {
  if (input.approverKind !== "human") {
    throw new Error("Agents cannot approve outreach. A human must approve.");
  }
  const db = getDb();
  const identity = evaluateHumanReview({
    caller: provenance.caller,
    authenticatedApprover: provenance.authenticatedApprover ?? null,
    requestedApprover: input.approverId ?? null,
  });
  if (!identity.allowed || !identity.approverId) {
    throw new Error(identity.reason);
  }
  const agent = await db
    .select()
    .from(agents)
    .where(eq(agents.id, identity.approverId))
    .limit(1);
  if (agent[0]?.kind === "agent") {
    throw new Error("Agents cannot approve outreach. A human must approve.");
  }
  const rows = await db
    .select()
    .from(courierDrafts)
    .where(eq(courierDrafts.id, input.draftId))
    .limit(1);
  const draft = rows[0];
  if (!draft) throw new Error("Draft not found");
  if (draft.status === "sent") {
    throw new Error("Draft has already been sent and cannot be re-approved.");
  }
  if (hashBytes(draft.subject + "\n" + draft.body) !== draft.sha256) {
    throw new Error("Draft changed after it was created. Approval refused.");
  }
  await db
    .update(courierDrafts)
    .set({
      status: "approved",
      approvedBy: identity.approverId,
      approvedSha256: draft.sha256,
    })
    .where(eq(courierDrafts.id, draft.id));
  await appendLedger({
    shipmentId: draft.shipmentId,
    actionName: "approveCourierDraft",
    caller: provenance.caller,
    actor: provenance.actor,
    payload: { draftId: draft.id, approvedSha256: draft.sha256 },
    inverseAction: "revokeOutreachApproval",
  });
  return {
    approved: true,
    boundHash: draft.sha256,
    approverId: identity.approverId,
  };
}

export const sendCourierEmail = atomicMutation(sendCourierEmailImpl);
async function sendCourierEmailImpl(
  input: { draftId: string },
  provenance: Provenance,
): Promise<{ sent: boolean; transport: string; sha256: string }> {
  const db = getDb();
  const rows = await db
    .select()
    .from(courierDrafts)
    .where(eq(courierDrafts.id, input.draftId))
    .limit(1);
  const draft = rows[0];
  if (!draft) throw new Error("Draft not found");
  if (draft.status !== "approved") {
    throw new Error("Draft needs a human approval before it can be sent.");
  }
  if (draft.approvedSha256 !== draft.sha256) {
    throw new Error("Draft hash changed after approval. Send refused.");
  }
  if (hashBytes(draft.subject + "\n" + draft.body) !== draft.sha256) {
    throw new Error("Draft bytes changed after approval. Send refused.");
  }
  const approverAgent = draft.approvedBy
    ? await db
        .select()
        .from(agents)
        .where(eq(agents.id, draft.approvedBy))
        .limit(1)
    : [];
  if (approverAgent[0]?.kind === "agent") {
    throw new Error("An agent approval cannot release outreach.");
  }
  await db
    .update(courierDrafts)
    .set({ status: "sent", sentAt: new Date().toISOString() })
    .where(eq(courierDrafts.id, draft.id));
  await appendLedger({
    shipmentId: draft.shipmentId,
    actionName: "sendCourierEmail",
    caller: provenance.caller,
    actor: provenance.actor,
    payload: {
      draftId: draft.id,
      sha256: draft.sha256,
      transport: "mock-ledger",
    },
    inverseAction: "retractOutreach",
  });
  return { sent: true, transport: "mock-ledger", sha256: draft.sha256 };
}

const PROPOSED_CODE = `import { createHash } from "node:crypto";
import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

export default defineAction({
  description: "Check that an Arabic shipping label contains Arabic script, required fields and an identifier.",
  schema: z.object({
    shipmentId: z.string(),
    label: z.string(),
  }),
  outputSchema: z.object({ ok: z.boolean(), checks: z.array(z.string()), labelHash: z.string() }),
  run: async ({ label }) => {
    const checks: string[] = [];
    checks.push(/[\\u0600-\\u06FF]/.test(label) ? "arabic-script-present" : "arabic-script-missing");
    checks.push(label.trim().split(/\\s+/).filter(Boolean).length >= 3 ? "field-count-ok" : "field-count-low");
    checks.push(/[\\w-]{4,}/.test(label) ? "identifier-present" : "identifier-missing");
    const labelHash = createHash("sha256").update(label).digest("hex").slice(0, 16);
    return {
      ok: checks.every((check) => !check.endsWith("missing") && check !== "field-count-low"),
      checks,
      labelHash,
    };
  },
});`;

export const proposeArabicLabel = atomicMutation(proposeArabicLabelImpl);
async function proposeArabicLabelImpl(
  input: { shipmentId: string },
  provenance: Provenance,
): Promise<{ proposalId: string }> {
  const db = getDb();
  const bundle = await getShipmentBundle(input.shipmentId);
  if (!bundle) throw new Error("Shipment not found");
  const proposalId = randomUUID();
  await db.insert(proposedActions).values({
    id: proposalId,
    shipmentId: bundle.shipment.id,
    name: "check-arabic-label",
    description:
      "Check that an Arabic shipping label contains Arabic script and the minimum required fields.",
    reason: `A shipment to ${bundle.shipment.destination} needs an Arabic label check that no existing action provides.`,
    code: PROPOSED_CODE,
    schemaJson: canonicalJSON({
      shipmentId: "string",
      label: "string",
    }),
    status: "pending",
  });
  await appendLedger({
    shipmentId: bundle.shipment.id,
    actionName: "proposeAction",
    caller: provenance.caller,
    actor: provenance.actor,
    payload: { proposalId, name: "check-arabic-label" },
    inverseAction: "rejectProposal",
  });
  return { proposalId };
}

export const reviewProposedAction = atomicMutation(reviewProposedActionImpl);
async function reviewProposedActionImpl(
  input: {
    proposalId: string;
    approverId?: string | null | undefined;
    reviewNote?: string | null | undefined;
  },
  provenance: Provenance,
): Promise<{ status: string; reviewedCodeSha256: string; reviewedBy: string }> {
  const db = getDb();
  const identity = evaluateHumanReview({
    caller: provenance.caller,
    authenticatedApprover: provenance.authenticatedApprover ?? null,
    requestedApprover: input.approverId ?? null,
  });
  if (!identity.allowed || !identity.approverId) {
    throw new Error(identity.reason);
  }
  const reviewer = await db
    .select()
    .from(agents)
    .where(eq(agents.id, identity.approverId))
    .limit(1);
  if (reviewer[0]?.kind === "agent") {
    throw new Error("Agents cannot review capability templates.");
  }
  const rows = await db
    .select()
    .from(proposedActions)
    .where(eq(proposedActions.id, input.proposalId))
    .limit(1);
  const proposal = rows[0];
  if (!proposal) throw new Error("Proposal not found");
  if (proposal.status === "active") {
    throw new Error("Capability is already active.");
  }
  const reviewedCodeSha256 = hashBytes(proposal.code);
  const reviewedAt = new Date().toISOString();
  await db
    .update(proposedActions)
    .set({
      status: "reviewed",
      reviewedBy: identity.approverId,
      reviewedAt,
      reviewedCodeSha256,
    })
    .where(eq(proposedActions.id, proposal.id));
  await appendLedger({
    shipmentId: proposal.shipmentId ?? "workspace",
    actionName: "reviewProposedAction",
    caller: provenance.caller,
    actor: provenance.actor,
    payload: {
      proposalId: proposal.id,
      name: proposal.name,
      reviewedBy: identity.approverId,
      reviewedCodeSha256,
      reviewNote: input.reviewNote ?? null,
    },
    inverseAction: "rejectProposal",
  });
  return {
    status: "reviewed",
    reviewedCodeSha256,
    reviewedBy: identity.approverId,
  };
}

export const approveProposedAction = atomicMutation(approveProposedActionImpl);
async function approveProposedActionImpl(
  input: { proposalId: string; approverId?: string | null | undefined },
  provenance: Provenance,
): Promise<{ status: string; runtimeLoad: boolean; message: string }> {
  const db = getDb();
  const identity = evaluateHumanReview({
    caller: provenance.caller,
    authenticatedApprover: provenance.authenticatedApprover ?? null,
    requestedApprover: input.approverId ?? null,
  });
  if (!identity.allowed || !identity.approverId) {
    throw new Error(identity.reason);
  }
  const agent = await db
    .select()
    .from(agents)
    .where(eq(agents.id, identity.approverId))
    .limit(1);
  if (agent[0]?.kind === "agent") {
    throw new Error("Agents cannot approve capability proposals.");
  }
  const rows = await db
    .select()
    .from(proposedActions)
    .where(eq(proposedActions.id, input.proposalId))
    .limit(1);
  const proposal = rows[0];
  if (!proposal) throw new Error("Proposal not found");
  const review = evaluateTemplateReview({
    status: proposal.status,
    codeSha256: hashBytes(proposal.code),
    reviewedCodeSha256: proposal.reviewedCodeSha256 ?? null,
    reviewedBy: proposal.reviewedBy ?? null,
  });
  if (!review.allowed) {
    throw new Error(review.reason);
  }
  await db
    .update(proposedActions)
    .set({
      status: "active",
      runtimeLoad: false,
      approvedBy: identity.approverId,
    })
    .where(eq(proposedActions.id, proposal.id));
  await appendLedger({
    shipmentId: proposal.shipmentId ?? "workspace",
    actionName: "approveProposedAction",
    caller: provenance.caller,
    actor: provenance.actor,
    payload: {
      proposalId: proposal.id,
      name: proposal.name,
      approvedBy: identity.approverId,
      reviewedBy: proposal.reviewedBy,
      reviewedCodeSha256: proposal.reviewedCodeSha256,
      runtimeLoad: false,
      reviewedTemplate: true,
    },
    inverseAction: "rejectProposal",
  });
  return {
    status: "active",
    runtimeLoad: false,
    message:
      "Capability activated from a reviewed template. No arbitrary agent code was executed; the fixed implementation stays gated server-side.",
  };
}

export const surgeVerify = atomicMutation(surgeVerifyImpl);
async function surgeVerifyImpl(
  shipmentId: string,
  workers: number,
  provenance: Provenance,
): Promise<{
  workers: number;
  totalLines: number;
  passed: number;
  failed: number;
  durationMs: number;
  costUsd: number;
  partitions: Array<{ worker: number; lines: number; status: string }>;
}> {
  const bundle = await getShipmentBundle(shipmentId);
  if (!bundle?.document) throw new Error("No document to verify");
  const document = bundle.document as unknown as CustomsDocument;
  const started = Date.now();
  const workerCount = Math.max(1, Math.min(8, Math.round(workers)));
  const partitions = Array.from({ length: workerCount }, (_, index) => {
    const lines = document.lines.filter(
      (_line, lineIndex) => lineIndex % workerCount === index,
    );
    return { index, lines };
  });
  const results = await Promise.all(
    partitions.map(async (partition) => {
      const checks = partition.lines.map((line) => {
        const expectedVat = round2(
          (line.customsValue + line.duty) * line.vatRate,
        );
        return Math.abs(expectedVat - line.vat) <= 0.005;
      });
      return {
        worker: partition.index + 1,
        lines: partition.lines.length,
        status: checks.every(Boolean) ? "pass" : "fail",
      };
    }),
  );
  const passed = results.filter((result) => result.status === "pass").length;
  const failed = results.length - passed;
  const durationMs = Date.now() - started;
  await appendLedger({
    shipmentId: bundle.shipment.id,
    actionName: "surgeVerify",
    caller: provenance.caller,
    actor: provenance.actor,
    payload: {
      workers: workerCount,
      totalLines: document.lines.length,
      passed,
      failed,
    },
    inverseAction: "noop",
  });
  return {
    workers: workerCount,
    totalLines: document.lines.length,
    passed,
    failed,
    durationMs,
    costUsd: 0,
    partitions: results,
  };
}

export async function generateDemoScript(): Promise<{
  script: string;
  clickPath: Array<{
    action: string;
    params: Record<string, unknown>;
    expect: string;
  }>;
  ledgerIds: number[];
}> {
  const entries = await ledgerEntries();
  if (entries.length === 0) {
    throw new Error("Ledger is empty. Run the seeded demo first.");
  }
  const byShipment = new Map<string, typeof entries>();
  for (const entry of entries) {
    const list = byShipment.get(entry.shipmentId) ?? [];
    list.push(entry);
    byShipment.set(entry.shipmentId, list);
  }
  const primary = [...byShipment.entries()].sort(
    (a, b) => b[1].length - a[1].length,
  )[0];
  if (!primary) throw new Error("No shipment ledger found");
  const [shipmentId, shipmentEntries] = primary;
  const lines = [
    "# Alora self-demo",
    "",
    "Generated from the ledger. No step was invented.",
    "",
    `Shipment: ${shipmentId}`,
    "",
    "| Time | Ledger action | Caller | What to show |",
    "| --- | --- | --- | --- |",
  ];
  shipmentEntries.forEach((entry, index) => {
    const seconds = 15 + index * 8;
    lines.push(
      `| 0:${String(Math.min(seconds, 59)).padStart(2, "0")} | ${entry.actionName} | ${entry.caller} | Click ${entry.actionName}; show entry ${entry.id}. |`,
    );
  });
  const clickPath = shipmentEntries.slice(0, 14).map((entry) => ({
    action: entry.actionName,
    params: { shipmentId, ledgerId: entry.id },
    expect: `Ledger entry ${entry.id} exists with hash ${entry.entryHash.slice(0, 12)}…`,
  }));
  return {
    script: lines.join("\n"),
    clickPath,
    ledgerIds: shipmentEntries.map((entry) => entry.id),
  };
}

export async function selfHealPreview(shipmentId: string) {
  const bundle = await getShipmentBundle(shipmentId);
  if (!bundle?.document || !bundle.lastVerification) {
    throw new Error("Run verification first");
  }
  const checks = bundle.lastVerification.checks as Array<{
    id: string;
    label: string;
    status: string;
    expected?: unknown;
    actual?: unknown;
  }>;
  const patches = checks
    .filter((check) => check.status === "fail")
    .map((check) => ({
      field: check.id,
      problem: check.label,
      expected: check.expected,
      actual: check.actual,
      patch:
        "Rebuild the customs package from the shipment and the versioned tariff snapshot.",
    }));
  if (!bundle.integrity.hashMatches) {
    patches.unshift({
      field: "hash-integrity",
      problem: "Stored bytes no longer match the submitted digest.",
      expected: bundle.activeDeliverable?.sha256,
      actual: "recomputed bytes differ",
      patch:
        "Create a new immutable version from the shipment; the current approval is invalid.",
    });
  }
  const totalChecks =
    Math.max(checks.length, 1) + (bundle.integrity.hashMatches ? 0 : 1);
  const confidence = round2(
    Math.max(0, totalChecks - patches.length) / totalChecks,
  );
  return {
    confidence,
    patches,
    requiresApproval: true,
    note: "Applying a patch creates a new immutable version. Any prior approval is invalidated by the new hash.",
  };
}

export const selfHealApply = atomicMutation(selfHealApplyImpl);
async function selfHealApplyImpl(
  shipmentId: string,
  provenance: Provenance,
): Promise<{
  deliverableId: string;
  sha256: string;
  version: number;
  previousApprovalsRevoked: number;
}> {
  const db = getDb();
  const before = await getShipmentBundle(shipmentId);
  if (!before) throw new Error("Shipment not found");
  const previousApprovalsRevoked = await revokeActiveApprovals(
    shipmentId,
    "Self-heal produced a new deliverable version with a new hash.",
    provenance,
  );
  const repaired = await repairDeliverable(shipmentId, provenance);
  await db.insert(evidence).values({
    id: randomUUID(),
    shipmentId,
    kind: "self-heal",
    summary: `Self-heal created version ${repaired.version} and invalidated prior approvals.`,
    detail: canonicalJSON({
      repaired,
      previousApprovalsRevoked,
    }),
  });
  return {
    ...repaired,
    previousApprovalsRevoked,
  };
}

export const checkArabicLabel = atomicMutation(checkArabicLabelImpl);
async function checkArabicLabelImpl(
  input: { shipmentId: string; label: string },
  provenance: Provenance,
): Promise<{ ok: boolean; checks: string[]; labelHash: string }> {
  const db = getDb();
  const rows = await db
    .select()
    .from(proposedActions)
    .where(
      and(
        eq(proposedActions.name, "check-arabic-label"),
        eq(proposedActions.status, "active"),
      ),
    )
    .limit(1);
  if (!rows[0]) {
    throw new Error(
      "Capability check-arabic-label is not active. A human must approve the proposal first.",
    );
  }
  const checks = [
    /[\u0600-\u06FF]/.test(input.label)
      ? "arabic-script-present"
      : "arabic-script-missing",
    input.label.trim().split(/\s+/).filter(Boolean).length >= 3
      ? "field-count-ok"
      : "field-count-low",
    /[\w-]{4,}/.test(input.label) ? "identifier-present" : "identifier-missing",
  ];
  const result = {
    ok: checks.every(
      (check) => !check.endsWith("missing") && check !== "field-count-low",
    ),
    checks,
    labelHash: hashBytes(input.label).slice(0, 16),
  };
  await appendLedger({
    shipmentId: input.shipmentId,
    actionName: "checkArabicLabel",
    caller: provenance.caller,
    actor: provenance.actor,
    payload: {
      proposalId: rows[0].id,
      labelHash: result.labelHash,
      ok: result.ok,
    },
    inverseAction: "noop",
  });
  return result;
}

export async function workspaceStats() {
  const db = getDb();
  const [shipmentRows, claimRows, runRows, deliverableRows] = await Promise.all(
    [
      db.select().from(shipments),
      db.select().from(claims),
      db.select().from(verificationRuns),
      db.select().from(deliverables),
    ],
  );
  return {
    shipments: shipmentRows.length,
    claims: claimRows.length,
    verified: claimRows.filter((claim) => claim.status === "verified").length,
    approved: claimRows.filter((claim) => claim.status === "human-approved")
      .length,
    rejectedRuns: runRows.filter((run) => run.status === "rejected").length,
    deliverables: deliverableRows.length,
  };
}

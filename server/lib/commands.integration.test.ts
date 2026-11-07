import { closeDbExec, withMigrationRuntime } from "@agent-native/core/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { validateManifest } from "../../shared/manifest.js";
import { getDb } from "../db/index.js";
import {
  approvals,
  claims,
  deliverables,
  evidence,
  items,
  ledgerHead,
  shipments,
  verificationRuns,
} from "../db/schema.js";
import migrate from "../plugins/db.js";
import {
  approveDeliverable,
  createShipment,
  exportShipmentManifest,
  repairDeliverable,
  resetWorkspace,
  rewindShipment,
  runBuilder,
  runVerifier,
  tamperDeliverable,
} from "./commands.js";
import { seedDemo } from "./extensions.js";
import { canonicalJSON, hashBytes } from "./hash.js";
import { inspectShipmentIntegrity } from "./integrity.js";
import { checkChain, ledgerEntries } from "./ledger.js";
import { getShipmentBundle } from "./queries.js";
import { withMutation } from "./transactions.js";

const operator = {
  caller: "ui" as const,
  actor: "human@example.com",
  authenticatedApprover: "human@example.com",
};
const agent = { caller: "agent" as const, actor: "agent-builder" };
async function shipment(destination = "DE") {
  return createShipment(
    {
      destination,
      currency: "EUR",
      shippingCost: 20,
      insuranceCost: 4,
      items: [
        {
          description: "Cotton T-shirts",
          hsCode: "61091000",
          quantity: 100,
          unitValue: 20,
          weightKg: 10,
        },
      ],
    },
    operator,
  );
}
async function approve(
  id: string,
  deliverableId: string,
  acknowledgeTariffBaseLevel = false,
) {
  return approveDeliverable(
    {
      shipmentId: id,
      deliverableId,
      approverKind: "human",
      acknowledgeTariffBaseLevel,
    },
    operator,
  );
}

beforeAll(async () => {
  await withMigrationRuntime(async () => {
    await migrate(null);
  });
}, 60_000);
beforeEach(async () => {
  await resetWorkspace();
});
afterAll(async () => {
  await closeDbExec();
});

describe("atomic evidence and approval lifecycle on PGlite", () => {
  it("does not report an empty package or a replacement hash as matching evidence", async () => {
    const created = await shipment();
    expect(await inspectShipmentIntegrity(created.id)).toMatchObject({
      valid: false,
      hasActiveDocument: false,
      allHashesMatch: false,
    });
    const built = await runBuilder(created.id, agent);
    const bytes = canonicalJSON({
      ...built.document,
      importer: "Changed importer",
    });
    await getDb()
      .update(deliverables)
      .set({ bytes, sha256: hashBytes(bytes) })
      .where(eq(deliverables.id, built.deliverableId));
    const result = await inspectShipmentIntegrity(created.id);
    expect(result.valid).toBe(false);
    expect(result.deliverables[0]).toMatchObject({
      hashMatches: true,
      submissionMatches: false,
    });
  });

  it("keeps a failed latest attempt authoritative even if original bytes are restored", async () => {
    const created = await shipment();
    const built = await runBuilder(created.id, agent);
    const original = (await getShipmentBundle(created.id))!.activeDeliverable!
      .bytes;
    await runVerifier(created.id, agent);
    await tamperDeliverable(created.id, agent);
    const rejected = await runVerifier(created.id, agent);
    await getDb()
      .update(deliverables)
      .set({ bytes: original })
      .where(eq(deliverables.id, built.deliverableId));
    await expect(approve(created.id, built.deliverableId)).rejects.toThrow(
      "verification",
    );
    expect((await getShipmentBundle(created.id))?.lastVerification?.id).toBe(
      rejected.runId,
    );
  });

  it("rolls domain rows, evidence and the ledger head back together", async () => {
    await expect(
      withMutation(async () => {
        const created = await shipment();
        await runBuilder(created.id, agent);
        throw new Error("injected failure after append");
      }),
    ).rejects.toThrow("injected failure");
    expect(await getDb().select().from(shipments)).toHaveLength(0);
    expect(await getDb().select().from(deliverables)).toHaveLength(0);
    expect(await getDb().select().from(evidence)).toHaveLength(0);
    expect(await ledgerEntries()).toHaveLength(0);
    expect((await getDb().select().from(ledgerHead))[0]).toMatchObject({
      tipId: 0,
      tipHash: "GENESIS",
    });
  });

  it("rolls a nested reset and seed back without losing the previous workspace", async () => {
    const existing = await shipment();
    const before = await ledgerEntries();
    await expect(
      withMutation(async () => {
        await seedDemo(operator);
        throw new Error("seed failure");
      }),
    ).rejects.toThrow("seed failure");
    expect(
      (await getDb().select().from(shipments)).map((row) => row.id),
    ).toEqual([existing.id]);
    expect(await ledgerEntries()).toEqual(before);
  });

  it("serializes concurrent version submissions without forking the chain", async () => {
    const created = await shipment();
    const versions = await Promise.all([
      runBuilder(created.id, agent),
      runBuilder(created.id, agent),
    ]);
    expect(versions.map((row) => row.version).sort()).toEqual([1, 2]);
    expect(
      (await getDb().select().from(deliverables)).filter(
        (row) => row.state === "active",
      ),
    ).toHaveLength(1);
    expect(checkChain(await ledgerEntries()).valid).toBe(true);
  });

  it("keeps an unchanged approval valid when the exact artifact is reverified", async () => {
    const created = await shipment();
    const built = await runBuilder(created.id, agent);
    const first = await runVerifier(created.id, agent);
    expect(first.status).toBe("verified");
    const approval = await approve(created.id, built.deliverableId);
    const next = await runVerifier(created.id, agent);
    const bundle = await getShipmentBundle(created.id);
    expect(bundle?.claim).toMatchObject({
      status: "human-approved",
      verificationRunId: next.runId,
    });
    expect(bundle?.activeApproval).toMatchObject({
      id: approval.approvalId,
      verificationRunId: first.runId,
    });
    expect(await approve(created.id, built.deliverableId)).toEqual(approval);
    expect(await getDb().select().from(approvals)).toHaveLength(1);
  });

  it("commits revocation when approval detects changed source inputs", async () => {
    const created = await shipment();
    const built = await runBuilder(created.id, agent);
    await runVerifier(created.id, agent);
    await approve(created.id, built.deliverableId);
    await getDb()
      .update(items)
      .set({ quantity: 101 })
      .where(eq(items.shipmentId, created.id));
    await expect(approve(created.id, built.deliverableId)).rejects.toThrow();
    const bundle = await getShipmentBundle(created.id);
    expect(bundle?.activeApproval).toBeNull();
    expect(bundle?.approvals[0]?.revoked).toBe(true);
    expect(bundle?.claim?.verificationRunId).toBeNull();
    expect(
      bundle?.ledger.some((row) => row.actionName === "revokeApproval"),
    ).toBe(true);
  });

  it("records malformed-byte rejection and revokes instead of crashing before the check", async () => {
    const created = await shipment();
    const built = await runBuilder(created.id, agent);
    await runVerifier(created.id, agent);
    await approve(created.id, built.deliverableId);
    await getDb()
      .update(deliverables)
      .set({ bytes: "{broken" })
      .where(eq(deliverables.id, built.deliverableId));
    const result = await runVerifier(created.id, agent);
    expect(result.status).toBe("rejected");
    expect(
      result.checks.some(
        (check) => check.id === "document-schema" && check.status === "fail",
      ),
    ).toBe(true);
    expect((await getShipmentBundle(created.id))?.approvals[0]?.revoked).toBe(
      true,
    );
    expect(await getDb().select().from(verificationRuns)).toHaveLength(2);
  });

  it("requires recorded UAE consent and revokes legacy consent even on an idempotent request", async () => {
    const created = await shipment("AE");
    const built = await runBuilder(created.id, agent);
    await runVerifier(created.id, agent);
    await expect(approve(created.id, built.deliverableId)).rejects.toThrow(
      "suffix",
    );
    await approve(created.id, built.deliverableId, true);
    await getDb().update(approvals).set({ tariffBaseLevelAcknowledged: false });
    await expect(
      approve(created.id, built.deliverableId, true),
    ).rejects.toThrow();
    expect((await getShipmentBundle(created.id))?.approvals[0]?.revoked).toBe(
      true,
    );
  });

  it("clears active evidence when rewound before the first submission and is idempotent", async () => {
    const created = await shipment();
    const target = (await ledgerEntries(created.id))[0]!.id;
    const built = await runBuilder(created.id, agent);
    await runVerifier(created.id, agent);
    await approve(created.id, built.deliverableId);
    await rewindShipment(
      { shipmentId: created.id, toLedgerId: target },
      operator,
    );
    const bundle = await getShipmentBundle(created.id);
    expect(bundle?.activeDeliverable).toBeNull();
    expect(bundle?.lastVerification).toBeNull();
    expect(bundle?.activeApproval).toBeNull();
    expect(bundle?.deliverables).toHaveLength(1);
    expect(bundle?.verificationRuns).toHaveLength(1);
    expect(bundle?.approvals[0]?.revoked).toBe(true);
    expect(await inspectShipmentIntegrity(created.id)).toMatchObject({
      valid: false,
      hasActiveDocument: false,
      allHashesMatch: false,
    });
    const count = (await ledgerEntries()).length;
    expect(
      (
        await rewindShipment(
          { shipmentId: created.id, toLedgerId: target },
          operator,
        )
      ).applied,
    ).toEqual([]);
    expect(await ledgerEntries()).toHaveLength(count);
  });

  it("restores prior bytes but never resurrects their revoked approval or verification", async () => {
    const created = await shipment();
    const first = await runBuilder(created.id, agent);
    await runVerifier(created.id, agent);
    await approve(created.id, first.deliverableId);
    const beforeRepair = await ledgerEntries(created.id);
    const target = beforeRepair[beforeRepair.length - 1]!.id;
    await repairDeliverable(created.id, agent);
    await rewindShipment(
      { shipmentId: created.id, toLedgerId: target },
      operator,
    );
    const bundle = await getShipmentBundle(created.id);
    expect(bundle?.activeDeliverable?.id).toBe(first.deliverableId);
    expect(bundle?.activeApproval).toBeNull();
    expect(bundle?.lastVerification).toBeNull();
    await expect(approve(created.id, first.deliverableId)).rejects.toThrow(
      "verification",
    );
    await runVerifier(created.id, agent);
    await approve(created.id, first.deliverableId);
    expect(await getDb().select().from(approvals)).toHaveLength(2);
  });

  it("clears the proof on tamper and refuses agent self approval", async () => {
    const created = await shipment();
    const built = await runBuilder(created.id, agent);
    await runVerifier(created.id, agent);
    await expect(
      approveDeliverable(
        {
          shipmentId: created.id,
          deliverableId: built.deliverableId,
          approverKind: "human",
        },
        { ...agent, authenticatedApprover: operator.actor },
      ),
    ).rejects.toThrow("agent-driven");
    await approve(created.id, built.deliverableId);
    expect((await tamperDeliverable(created.id, agent)).revokedApprovals).toBe(
      1,
    );
    expect((await getShipmentBundle(created.id))?.lastVerification).toBeNull();
    expect((await getDb().select().from(claims))[0]?.status).toBe("submitted");
  });
});

describe("manifest proof bindings", () => {
  async function approvedManifest(destination = "DE") {
    const created = await shipment(destination);
    const built = await runBuilder(created.id, agent);
    await runVerifier(created.id, agent);
    await approve(created.id, built.deliverableId, destination === "AE");
    return exportShipmentManifest(created.id);
  }

  it("rejects empty, missing and unsupported manifest structures", () => {
    for (const value of [
      {},
      null,
      { manifestVersion: 1 },
      { manifestVersion: 2 },
    ]) {
      expect(validateManifest(value).status).toBe("invalid");
    }
  });

  it("validates a complete approval and reports drafts as incomplete", async () => {
    const manifest = await approvedManifest();
    expect(validateManifest(manifest)).toMatchObject({
      status: "approved",
      valid: true,
      errors: [],
    });
    expect(validateManifest(manifest, "0".repeat(64)).status).toBe("invalid");
    const draft = await shipment();
    expect(
      validateManifest(await exportShipmentManifest(draft.id)),
    ).toMatchObject({ status: "incomplete", valid: true });
  });

  it("rejects a replacement document and fresh hash against the original ledger", async () => {
    const manifest = await approvedManifest();
    const doc = manifest.documents[0]!;
    const parsed = JSON.parse(doc.bytes);
    parsed.importer = "Substituted importer";
    doc.bytes = canonicalJSON(parsed);
    doc.sha256 = hashBytes(doc.bytes);
    doc.recomputedSha256 = doc.sha256;
    doc.byteLength = Buffer.byteLength(doc.bytes);
    expect(
      validateManifest(manifest).errors.some((error) =>
        error.includes("submission"),
      ),
    ).toBe(true);
  });

  it("rejects omitted proofs, changed checks, altered ledger metadata and forged consent", async () => {
    const manifest = await approvedManifest("AE");
    const missingProof = structuredClone(manifest);
    missingProof.verificationRuns = [];
    expect(validateManifest(missingProof).status).toBe("invalid");
    const checks = structuredClone(manifest);
    checks.verificationRuns[0]!.checks[0]!.detail = "substituted proof";
    expect(validateManifest(checks).status).toBe("invalid");
    const metadata = structuredClone(manifest);
    metadata.ledger.rows[0]!.actor = "another-human@example.com";
    expect(validateManifest(metadata).status).toBe("invalid");
    const consent = structuredClone(manifest);
    consent.approvals[0]!.tariffBaseLevelAcknowledged = false;
    expect(validateManifest(consent).status).toBe("invalid");
  });

  it("keeps historical tamper evidence without declaring current bytes corrupt", async () => {
    const manifest = await approvedManifest();
    await tamperDeliverable(manifest.shipment.id, agent);
    expect(
      validateManifest(await exportShipmentManifest(manifest.shipment.id))
        .status,
    ).toBe("invalid");
    const repaired = await repairDeliverable(manifest.shipment.id, agent);
    await runVerifier(manifest.shipment.id, agent);
    await approve(manifest.shipment.id, repaired.deliverableId);
    const exported = await exportShipmentManifest(manifest.shipment.id);
    expect(exported.historicalMismatches).toBe(1);
    expect(validateManifest(exported)).toMatchObject({
      status: "approved",
      valid: true,
      errors: [],
    });
  });

  it("does not permit an older passing run to replace the latest failed proof", async () => {
    const manifest = await approvedManifest();
    await tamperDeliverable(manifest.shipment.id, agent);
    await runVerifier(manifest.shipment.id, agent);
    const exported = await exportShipmentManifest(manifest.shipment.id);
    exported.claim!.verificationRunId = manifest.claim!.verificationRunId;
    expect(
      validateManifest(exported).errors.some((error) =>
        error.includes("latest ledger transition"),
      ),
    ).toBe(true);
  });
});

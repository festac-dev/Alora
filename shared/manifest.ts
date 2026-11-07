import { z } from "zod";

import { canonicalJSON, hashBytes, sha256 } from "../server/lib/hash.ts";
import { proofMatches, storedConsentCovers } from "../server/lib/proofs.ts";
import { tariffRequirements } from "../server/lib/tariffs.ts";
import {
  verifyPackage,
  VERIFICATION_POLICY_VERSION,
} from "../server/lib/verification.ts";
import {
  customsDocumentSchema,
  verificationCheckSchema,
} from "./customs-schema.ts";
import { checkChain } from "./evidence-chain.ts";
import { verificationInputsHash } from "./verification-inputs.ts";

const text = z.string().min(1);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const instant = z.string().datetime({ offset: true });
const count = z.number().int().nonnegative();
const money = z.number().nonnegative();

export const manifestSchema = z.strictObject({
  manifestVersion: z.literal(2),
  exportId: text,
  exportedAt: instant,
  shipment: z.strictObject({
    id: text,
    reference: text,
    destination: text,
    currency: text,
    status: text,
    forkedFrom: text.nullable(),
  }),
  inputs: z.strictObject({
    shipment: z.strictObject({
      reference: text,
      destination: text,
      currency: text,
      incoterms: text,
      exporter: text,
      importer: text,
      shippingCost: money,
      insuranceCost: money,
    }),
    items: z.array(
      z.strictObject({
        id: text,
        description: text,
        hsCode: text.nullable(),
        hsConfidence: z.number().nullable(),
        hsRationale: z.string().nullable(),
        quantity: z.number().int().positive(),
        unitValue: money,
        currency: text,
        weightKg: money,
        countryOfOrigin: text,
      }),
    ),
  }),
  inputsHash: hash,
  claim: z
    .strictObject({
      id: text,
      status: z.enum(["claimed", "submitted", "verified", "human-approved"]),
      deliverableId: text.nullable(),
      verificationRunId: text.nullable(),
    })
    .nullable(),
  effectiveApprovalId: text.nullable(),
  documents: z.array(
    z.strictObject({
      id: text,
      filename: text,
      version: z.number().int().positive(),
      state: z.enum(["active", "superseded", "retracted"]),
      mime: z.literal("application/json"),
      sha256: hash,
      recomputedSha256: hash,
      hashMatches: z.boolean(),
      byteLength: count,
      bytes: z.string(),
      createdAt: instant,
    }),
  ),
  historicalMismatches: count,
  verificationRuns: z.array(
    z.strictObject({
      id: text,
      shipmentId: text,
      deliverableId: text.nullable(),
      status: z.enum(["verified", "rejected"]),
      checks: z.array(verificationCheckSchema).nonempty(),
      evidenceHash: hash.nullable(),
      verifiedSha256: hash.nullable(),
      inputsHash: hash.nullable(),
      policyVersion: z.number().int().positive(),
      createdAt: instant,
    }),
  ),
  approvals: z.array(
    z.strictObject({
      id: text,
      shipmentId: text,
      deliverableId: text,
      approverId: text,
      approverKind: text,
      approvedSha256: hash,
      verificationRunId: text.nullable(),
      tariffBaseLevelAcknowledged: z.boolean(),
      tariffBaseLevelCodes: z.string().nullable(),
      revoked: z.boolean(),
      revokedReason: z.string().nullable(),
      createdAt: instant,
      revokedAt: instant.nullable(),
    }),
  ),
  ledger: z.strictObject({
    entries: count,
    shipmentEntries: count,
    shipmentEntryIds: z.array(z.number().int().positive()),
    finalHash: z.union([hash, z.literal("GENESIS")]),
    chainValid: z.boolean(),
    rows: z.array(
      z.strictObject({
        id: z.number().int().positive(),
        shipmentId: text,
        actionName: text,
        caller: text,
        actor: text,
        inverseAction: text,
        payload: text,
        prevHash: z.union([hash, z.literal("GENESIS")]),
        entryHash: hash,
        createdAt: instant,
      }),
    ),
  }),
  disclaimer: text,
});

export type ShipmentManifest = z.infer<typeof manifestSchema>;
export interface ManifestValidation {
  valid: boolean;
  status: "approved" | "incomplete" | "invalid";
  currentVerificationPassed: boolean;
  errors: string[];
  warnings: string[];
}

/** One validator for the export contract and the offline CLI. No SQL or app runtime. */
export function validateManifest(
  value: unknown,
  expectedTip?: string,
): ManifestValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const result = (
    currentVerificationPassed = false,
    approved = false,
  ): ManifestValidation => ({
    valid: errors.length === 0,
    status: errors.length ? "invalid" : approved ? "approved" : "incomplete",
    currentVerificationPassed,
    errors,
    warnings,
  });
  const parsed = manifestSchema.safeParse(value);
  if (!parsed.success) {
    errors.push(
      ...parsed.error.issues.map(
        (issue) => `${issue.path.join(".") || "manifest"}: ${issue.message}`,
      ),
    );
    return result();
  }
  const manifest = parsed.data;
  const {
    shipment,
    inputs,
    documents,
    verificationRuns: runs,
    approvals,
    ledger,
  } = manifest;
  const require = (ok: unknown, message: string) => {
    if (!ok) errors.push(message);
  };
  const same = (a: unknown, b: unknown) =>
    canonicalJSON(a) === canonicalJSON(b);
  const uniqueIds = (rows: { id: string }[], label: string) =>
    require(new Set(rows.map((row) => row.id)).size ===
      rows.length, `${label}: duplicate IDs`);
  uniqueIds(documents, "documents");
  uniqueIds(runs, "verification runs");
  uniqueIds(approvals, "approvals");
  uniqueIds(inputs.items, "source items");
  require(new Set(documents.map((row) => row.version)).size ===
    documents.length, "Duplicate document version");
  const chain = checkChain(ledger.rows);
  require(chain.valid &&
    ledger.chainValid, "Ledger chain or duplicated event metadata is invalid");
  require(chain.tipHash ===
    ledger.finalHash, "Ledger final hash does not match its rows");
  if (expectedTip !== undefined)
    require(ledger.finalHash ===
      expectedTip, "Ledger tip does not match the independently retained hash");
  require(ledger.entries ===
    ledger.rows.length, "Ledger row count is incorrect");
  const shipmentEntries = ledger.rows.filter(
    (row) => row.shipmentId === shipment.id,
  );
  require(ledger.shipmentEntries === shipmentEntries.length &&
    same(
      ledger.shipmentEntryIds,
      shipmentEntries.map((row) => row.id),
    ), "Shipment ledger references or counts are incorrect");
  require(shipmentEntries.some(
    (row) => row.actionName === "createShipment",
  ), "Shipment creation is missing from the ledger");
  require(manifest.inputsHash ===
    verificationInputsHash(inputs), "Source inputs fingerprint is incorrect");
  require((["reference", "destination", "currency"] as const).every(
    (field) => shipment[field] === inputs.shipment[field],
  ), "Shipment metadata does not match source inputs");
  if (!chain.valid) return result();

  const events = shipmentEntries.map((row) => ({
    row,
    data: (JSON.parse(row.payload) as { data: Record<string, unknown> }).data,
  }));
  if (
    events.some(
      (event) =>
        !event.data ||
        typeof event.data !== "object" ||
        Array.isArray(event.data),
    )
  ) {
    errors.push("Shipment ledger event has no structured payload");
    return result();
  }
  const submissions = events.filter(({ row }) =>
    [
      "builderClassify",
      "builderClassifyWithPlantedError",
      "submitDeliverable",
    ].includes(row.actionName),
  );
  const verifiedEvents = events.filter(
    ({ row }) => row.actionName === "verifierCheck",
  );
  const approvedEvents = events.filter(
    ({ row }) => row.actionName === "approveDeliverable",
  );
  const matchesIds = (
    rows: { id: string }[],
    recorded: typeof events,
    key: string,
  ) =>
    same(
      rows.map((row) => row.id).sort(),
      recorded.map((event) => event.data[key]).sort(),
    );
  require(matchesIds(
    documents,
    submissions,
    "deliverableId",
  ), "Document inventory does not match submitted ledger artifacts");
  require(matchesIds(
    runs,
    verifiedEvents,
    "runId",
  ), "Verification inventory does not match ledger records");
  require(matchesIds(
    approvals,
    approvedEvents,
    "approvalId",
  ), "Approval inventory does not match ledger records");

  let artifactId: string | null | undefined = null;
  let currentRunId: unknown = null;
  const revoked = new Set<string>();
  for (const { row, data } of events) {
    if (submissions.some((entry) => entry.row.id === row.id)) {
      artifactId =
        typeof data.deliverableId === "string" ? data.deliverableId : null;
      currentRunId = null;
    }
    if (row.actionName === "verifierCheck") currentRunId = data.runId;
    if (row.actionName === "revokeApproval") {
      require(Array.isArray(
        data.revokedApprovalIds,
      ), `Revocation #${row.id} has no approval IDs`);
      if (Array.isArray(data.revokedApprovalIds))
        for (const id of data.revokedApprovalIds) revoked.add(String(id));
      currentRunId = null;
    }
    if (["tamperDetected", "invalidateVerification"].includes(row.actionName))
      currentRunId = null;
    if (row.actionName === "rewindShipment") {
      artifactId =
        typeof data.restoredDeliverableId === "string"
          ? data.restoredDeliverableId
          : data.restoredDeliverableId === null
            ? null
            : undefined;
      currentRunId = null;
      // Legacy rewind events revoked approvals directly; retain that evidence.
      for (const event of approvedEvents)
        if (event.row.id < row.id && event.row.id > Number(data.rewoundTo))
          revoked.add(String(event.data.approvalId));
    }
  }
  if (artifactId === undefined)
    warnings.push("Legacy rewind did not record a restored artifact binding.");
  else
    require((manifest.claim?.deliverableId ?? null) ===
      artifactId, "Current artifact does not match the ledger lifecycle");
  const latestRecordedRun = runs.find((run) => run.id === currentRunId);
  if (
    !latestRecordedRun ||
    latestRecordedRun.policyVersion >= VERIFICATION_POLICY_VERSION
  ) {
    require((manifest.claim?.verificationRunId ?? null) ===
      currentRunId, "Current verification pointer does not match the latest ledger transition");
  }
  const active = documents.find(
    (row) => row.id === manifest.claim?.deliverableId,
  );
  require(documents.filter((row) => row.state === "active").length ===
    (active ? 1 : 0) &&
    (!active ||
      active.state ===
        "active"), "Active document state disagrees with the claim");
  let historicalMismatches = 0;
  for (const document of documents) {
    const submitted = submissions.find(
      (event) => event.data.deliverableId === document.id,
    );
    require(submitted?.data.sha256 === document.sha256 &&
      submitted?.data.version ===
        document.version, `${document.id}: hash/version is not bound to its submission`);
    const digest = hashBytes(document.bytes);
    require(digest === document.recomputedSha256 &&
      (digest === document.sha256) === document.hashMatches &&
      Buffer.byteLength(document.bytes, "utf8") ===
        document.byteLength, `${document.id}: declared byte integrity is incorrect`);
    if (digest !== document.sha256) {
      if (document.state === "active")
        errors.push(
          `${document.id}: active bytes differ from the submitted hash`,
        );
      else historicalMismatches += 1;
    }
  }
  require(manifest.historicalMismatches ===
    historicalMismatches, "Historical mismatch count is incorrect");
  if (historicalMismatches)
    warnings.push(
      `${historicalMismatches} historical artifact(s) have changed bytes; their original hashes and records are preserved.`,
    );

  for (const run of runs) {
    const event = verifiedEvents.find((entry) => entry.data.runId === run.id);
    const document = documents.find((row) => row.id === run.deliverableId);
    require(run.shipmentId === shipment.id &&
      document &&
      event?.data.deliverableId ===
        run.deliverableId, `${run.id}: verification references a different or missing artifact`);
    require(event?.data.deliverableSha256 === document?.sha256 &&
      event?.data.status === run.status &&
      event?.data.evidenceHash ===
        run.evidenceHash, `${run.id}: verification does not match its ledger proof`);
    require(sha256(canonicalJSON(run.checks)) ===
      run.evidenceHash, `${run.id}: checks do not match evidenceHash`);
    require(new Set(run.checks.map((check) => check.id)).size ===
      run.checks.length, `${run.id}: duplicate checks`);
    require((run.status === "rejected") ===
      run.checks.some(
        (check) => check.status === "fail",
      ), `${run.id}: status contradicts its checks`);
    if (run.policyVersion === VERIFICATION_POLICY_VERSION) {
      require(event?.data.policyVersion === run.policyVersion &&
        event?.data.inputsHash === run.inputsHash &&
        event?.data.verifiedSha256 === run.verifiedSha256 &&
        run.inputsHash &&
        run.verifiedSha256, `${run.id}: verification policy, input or byte binding is missing`);
      if (run.status === "verified")
        require(run.verifiedSha256 ===
          document?.sha256, `${run.id}: passing proof binds a different hash`);
    } else if (run.policyVersion === 1)
      warnings.push(
        `${run.id}: legacy proof cannot authorize current approval.`,
      );
    else
      errors.push(
        `${run.id}: unsupported verification policy ${run.policyVersion}`,
      );
  }
  for (const approval of approvals) {
    const event = approvedEvents.find(
      (entry) => entry.data.approvalId === approval.id,
    );
    const document = documents.find((row) => row.id === approval.deliverableId);
    const run = runs.find((row) => row.id === approval.verificationRunId);
    require(approval.shipmentId === shipment.id &&
      document &&
      run &&
      run.deliverableId === document.id &&
      run.status ===
        "verified", `${approval.id}: approval has no passing proof for its artifact`);
    require(event?.data.deliverableId === approval.deliverableId &&
      event?.data.approverId === approval.approverId &&
      event?.data.approvedSha256 === approval.approvedSha256 &&
      event?.data.verificationRunId === approval.verificationRunId &&
      approval.approvedSha256 ===
        document?.sha256, `${approval.id}: approval hash, human or verification binding differs from the ledger`);
    require(approval.approverKind === "human" &&
      event &&
      ["ui", "cli", "http"].includes(event.row.caller) &&
      event.row.actor ===
        approval.approverId, `${approval.id}: approval lacks human caller attribution`);
    const codes =
      approval.tariffBaseLevelCodes
        ?.split(",")
        .map((code) => code.trim())
        .filter(Boolean) ?? [];
    require(Boolean(event?.data.tariffBaseLevelAcknowledged) ===
      approval.tariffBaseLevelAcknowledged &&
      same(
        event?.data.tariffBaseLevelCodes ?? [],
        codes,
      ), `${approval.id}: tariff consent differs from the recorded acknowledgement`);
    require(approval.revoked ===
      revoked.has(
        approval.id,
      ), `${approval.id}: revocation state disagrees with the ledger`);
  }
  const currentRun = runs.find(
    (row) => row.id === manifest.claim?.verificationRunId,
  );
  const binding = {
    shipmentId: shipment.id,
    deliverableId: active?.id ?? "",
    sha256: active?.sha256 ?? "",
    inputsHash: manifest.inputsHash,
  };
  const fresh = active
    ? verifyPackage({
        bytes: active.bytes,
        storedSha256: active.sha256,
        jurisdiction: shipment.destination,
        expected: inputs,
      })
    : null;
  const currentVerificationPassed =
    artifactId !== undefined &&
    Boolean(
      active &&
      fresh?.status === "verified" &&
      proofMatches(currentRun, binding) &&
      currentRun?.evidenceHash === sha256(canonicalJSON(fresh.checks)),
    );
  const parsedDocument = active
    ? customsDocumentSchema.safeParse(safeJson(active.bytes))
    : null;
  const requirements = parsedDocument?.success
    ? tariffRequirements(parsedDocument.data, shipment.destination)
    : null;
  const eligible = approvals.filter(
    (approval) =>
      !approval.revoked &&
      approval.deliverableId === active?.id &&
      approval.approvedSha256 === active?.sha256 &&
      proofMatches(
        runs.find((run) => run.id === approval.verificationRunId),
        binding,
      ) &&
      requirements &&
      !requirements.unresolvedCodes.length &&
      storedConsentCovers(approval, requirements.unconfirmedCodes),
  );
  require(eligible.length <= 1, "More than one effective approval");
  const approved =
    currentVerificationPassed &&
    manifest.claim?.status === "human-approved" &&
    eligible.length === 1;
  require(manifest.effectiveApprovalId ===
    (approved
      ? eligible[0]!.id
      : null), "Effective approval is not supported by current proof and recorded consent");
  if (!currentVerificationPassed)
    warnings.push(
      "Current document needs verification against these source inputs.",
    );
  if (!approved)
    warnings.push("No effective human approval for the current artifact.");
  return result(currentVerificationPassed, approved);
}

function safeJson(bytes: string): unknown {
  try {
    return JSON.parse(bytes);
  } catch {
    return null;
  }
}

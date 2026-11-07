import { z } from "zod";

import { verificationCheckSchema } from "../../shared/customs-schema.ts";
import type { LedgerRow } from "../../shared/evidence-chain.ts";
import { canonicalJSON, sha256 } from "./hash.ts";
import { VERIFICATION_POLICY_VERSION } from "./verification.ts";

export interface ProofBinding {
  shipmentId: string;
  deliverableId: string;
  sha256: string;
  inputsHash: string;
}

export interface StoredProof {
  id: string;
  shipmentId: string;
  deliverableId: string | null;
  status: string;
  checks: unknown;
  evidenceHash: string | null;
  verifiedSha256: string | null;
  inputsHash: string | null;
  policyVersion: number;
}

export function proofMatches(
  run: StoredProof | null | undefined,
  binding: ProofBinding,
): boolean {
  if (
    !run ||
    run.status !== "verified" ||
    run.policyVersion !== VERIFICATION_POLICY_VERSION ||
    run.shipmentId !== binding.shipmentId ||
    run.deliverableId !== binding.deliverableId ||
    run.verifiedSha256 !== binding.sha256 ||
    run.inputsHash !== binding.inputsHash
  )
    return false;
  try {
    const parsed = z
      .array(verificationCheckSchema)
      .nonempty()
      .safeParse(
        typeof run.checks === "string" ? JSON.parse(run.checks) : run.checks,
      );
    if (!parsed.success) return false;
    const checks = parsed.data;
    if (
      checks.some((check) => check.status === "fail") ||
      new Set(checks.map((check) => check.id)).size !== checks.length ||
      sha256(canonicalJSON(checks)) !== run.evidenceHash
    )
      return false;
    return [
      "hash-integrity",
      "required-fields",
      "input-items",
      "goods-total",
      "duty-total",
      "vat-total",
      "landed-cost",
    ].every((id) =>
      checks.some((check) => check.id === id && check.status === "pass"),
    );
  } catch {
    return false;
  }
}

export function storedConsentCovers(
  approval: {
    tariffBaseLevelAcknowledged: boolean;
    tariffBaseLevelCodes: string | null;
  },
  requiredCodes: string[],
): boolean {
  if (!requiredCodes.length) return true;
  const recorded = new Set(
    approval.tariffBaseLevelCodes?.split(",").map((code) => code.trim()),
  );
  return (
    approval.tariffBaseLevelAcknowledged &&
    requiredCodes.every((code) => recorded.has(code))
  );
}

export function proofWasRecorded(
  run: StoredProof | null | undefined,
  entries: LedgerRow[],
): boolean {
  if (!run || run.policyVersion !== VERIFICATION_POLICY_VERSION) return false;
  return entries.some((row) => {
    if (row.shipmentId !== run.shipmentId || row.actionName !== "verifierCheck")
      return false;
    try {
      const { data } = JSON.parse(row.payload);
      return (
        data.runId === run.id &&
        data.deliverableId === run.deliverableId &&
        data.status === run.status &&
        data.evidenceHash === run.evidenceHash &&
        data.verifiedSha256 === run.verifiedSha256 &&
        data.inputsHash === run.inputsHash &&
        data.policyVersion === run.policyVersion
      );
    } catch {
      return false;
    }
  });
}

export function approvalWasRecorded(
  approval: {
    id: string;
    shipmentId: string;
    deliverableId: string;
    approverId: string;
    approverKind: string;
    approvedSha256: string;
    verificationRunId: string | null;
    tariffBaseLevelAcknowledged: boolean;
    tariffBaseLevelCodes: string | null;
  },
  entries: LedgerRow[],
): boolean {
  let recorded = false;
  for (const row of entries) {
    if (row.shipmentId !== approval.shipmentId) continue;
    try {
      const { data } = JSON.parse(row.payload);
      if (
        row.actionName === "approveDeliverable" &&
        data.approvalId === approval.id
      ) {
        const codes =
          approval.tariffBaseLevelCodes
            ?.split(",")
            .map((code) => code.trim())
            .filter(Boolean) ?? [];
        recorded =
          approval.approverKind === "human" &&
          ["ui", "cli", "http"].includes(row.caller) &&
          row.actor === approval.approverId &&
          data.deliverableId === approval.deliverableId &&
          data.approverId === approval.approverId &&
          data.approvedSha256 === approval.approvedSha256 &&
          data.verificationRunId === approval.verificationRunId &&
          Boolean(data.tariffBaseLevelAcknowledged) ===
            approval.tariffBaseLevelAcknowledged &&
          canonicalJSON(data.tariffBaseLevelCodes ?? []) ===
            canonicalJSON(codes);
      }
      if (
        (row.actionName === "revokeApproval" &&
          data.revokedApprovalIds?.includes(approval.id)) ||
        row.actionName === "rewindShipment"
      )
        recorded = false;
    } catch {
      return false;
    }
  }
  return recorded;
}

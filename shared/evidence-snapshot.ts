import { z } from "zod";

export const evidenceSnapshotSchema = z.strictObject({
  shipmentId: z.string(),
  deliverableId: z.string().nullable(),
  storedHash: z.string().nullable(),
  actualHash: z.string().nullable(),
  inputsHash: z.string(),
  verificationRunId: z.string().nullable(),
  approvalId: z.string().nullable(),
  ledgerTip: z.string(),
});
export type EvidenceSnapshot = z.infer<typeof evidenceSnapshotSchema>;

export function evidenceSnapshotKey(
  snapshot: EvidenceSnapshot | null | undefined,
): string {
  return snapshot
    ? JSON.stringify([
        snapshot.shipmentId,
        snapshot.deliverableId,
        snapshot.storedHash,
        snapshot.actualHash,
        snapshot.inputsHash,
        snapshot.verificationRunId,
        snapshot.approvalId,
        snapshot.ledgerTip,
      ])
    : "none";
}

export const evidenceResultSchema = z.strictObject({
  shipmentId: z.string(),
  snapshot: evidenceSnapshotSchema,
  chainValid: z.boolean(),
  brokenAtLedgerId: z.number().nullable(),
  ledgerEntries: z.number(),
  globalLedgerEntries: z.number(),
  tipHash: z.string(),
  deliverables: z.array(
    z.strictObject({
      id: z.string(),
      filename: z.string(),
      storedHash: z.string(),
      recomputedHash: z.string(),
      hashMatches: z.boolean(),
      submissionMatches: z.boolean(),
      state: z.string(),
    }),
  ),
  hasActiveDocument: z.boolean(),
  allHashesMatch: z.boolean(),
  historicalMismatches: z.number().int().nonnegative(),
  valid: z.boolean(),
});
export type EvidenceResult = z.infer<typeof evidenceResultSchema>;

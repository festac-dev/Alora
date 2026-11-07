import { z } from "zod";

import {
  customsDocumentSchema,
  verificationCheckSchema,
} from "./customs-schema.js";
import { evidenceSnapshotSchema } from "./evidence-snapshot.js";

// SQL rows may gain additive fields; proof and integrity fields remain explicit.
const document = z.looseObject({
  id: z.string(),
  shipmentId: z.string(),
  sha256: z.string(),
  version: z.number().int(),
  state: z.string(),
  hashMatches: z.boolean(),
  byteLength: z.number().int(),
});
const approval = z.looseObject({
  id: z.string(),
  shipmentId: z.string(),
  deliverableId: z.string(),
  approverId: z.string(),
  approverKind: z.string(),
  approvedSha256: z.string(),
  verificationRunId: z.string().nullable(),
  tariffBaseLevelAcknowledged: z.boolean(),
  tariffBaseLevelCodes: z.string().nullable(),
  revoked: z.boolean(),
});
const verification = z.looseObject({
  id: z.string(),
  shipmentId: z.string(),
  deliverableId: z.string().nullable(),
  status: z.enum(["verified", "rejected"]),
  checks: z.array(verificationCheckSchema),
  verifiedSha256: z.string().nullable(),
  inputsHash: z.string().nullable(),
  evidenceHash: z.string().nullable(),
  policyVersion: z.number().int(),
});

export const shipmentBundleSchema = z.looseObject({
  shipment: z.looseObject({
    id: z.string(),
    reference: z.string(),
    destination: z.string(),
    currency: z.string(),
    status: z.string(),
  }),
  items: z.array(
    z.looseObject({
      id: z.string(),
      shipmentId: z.string(),
      description: z.string(),
      hsCode: z.string().nullable(),
      quantity: z.number().int(),
      unitValue: z.number(),
    }),
  ),
  claim: z
    .looseObject({
      id: z.string(),
      shipmentId: z.string(),
      deliverableId: z.string().nullable(),
      verificationRunId: z.string().nullable(),
      status: z.enum(["claimed", "submitted", "verified", "human-approved"]),
    })
    .nullable(),
  deliverables: z.array(document),
  activeDeliverable: document.extend({ bytes: z.string() }).nullable(),
  document: customsDocumentSchema.nullable(),
  approvals: z.array(approval),
  activeApproval: approval.nullable(),
  approvalHistory: approval.nullable(),
  verificationRuns: z.array(verification),
  lastVerification: verification.nullable(),
  tariffRequirements: z.strictObject({
    unconfirmedCodes: z.array(z.string()),
    unresolvedCodes: z.array(z.string()),
    resolved: z.boolean(),
  }),
  integrity: z.strictObject({
    hashMatches: z.boolean(),
    hasDeliverable: z.boolean(),
    verificationCurrent: z.boolean(),
    approvalHashMatches: z.boolean().nullable(),
    approvalRevoked: z.boolean(),
  }),
  snapshot: evidenceSnapshotSchema,
  chain: z.looseObject({
    valid: z.boolean(),
    brokenAt: z.number().nullable(),
    entries: z.number().int(),
    globalEntries: z.number().int(),
    tipHash: z.string(),
  }),
  risk: z.enum(["amber", "red", "green", "critical"]),
});

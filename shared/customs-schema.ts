import { z } from "zod";

const text = z
  .string()
  .min(1)
  .refine((value) => value.trim().length > 0);
const money = z
  .number()
  .nonnegative()
  .refine(
    (value) => Number.isSafeInteger(Math.round(value * 100)),
    "Money must fit in safe integer cents",
  );
const quantity = z.number().int().positive().max(2_147_483_647);

export const verificationCheckSchema = z.strictObject({
  id: z.string(),
  label: z.string(),
  status: z.enum(["pass", "fail", "warn"]),
  detail: z.string(),
  expected: z.union([z.string(), z.number(), z.null()]).optional(),
  actual: z.union([z.string(), z.number(), z.null()]).optional(),
});

// Older immutable packages predate tariff-level metadata. Absence is accepted
// structurally; the trusted tariff resolver, never these flags, decides consent.
export const customsDocumentSchema = z.strictObject({
  document: z.literal("customs-package"),
  schemaVersion: z.literal(1),
  shipmentRef: text,
  destination: text,
  currency: text,
  incoterms: text,
  exporter: text,
  importer: text,
  issuedAt: z.string().datetime({ offset: true }),
  lines: z.array(
    z.strictObject({
      itemId: text,
      description: text,
      hsCode: text,
      quantity,
      unitValue: money,
      lineTotal: money,
      allocatedCharges: money,
      customsValue: money,
      dutyRate: z.number().nonnegative(),
      vatRate: z.number().nonnegative(),
      duty: money,
      vat: money,
      tariffSource: text,
      tariffVersion: text,
      tariffUrl: z.string(),
      tariffCodeLevel: text.optional(),
      tariffNationalSuffixUnconfirmed: z.boolean().optional(),
      tariffDatasetVersion: text.optional(),
      tariffMissing: z.boolean(),
    }),
  ),
  totals: z.strictObject({
    goodsValue: money,
    shipping: money,
    insurance: money,
    customsValue: money,
    duty: money,
    vat: money,
    landedCost: money,
  }),
  packingList: z.strictObject({
    totalPieces: z.number().int().nonnegative(),
    totalWeightKg: money,
    lines: z.array(
      z.strictObject({
        description: text,
        quantity,
        weightKg: money,
        countryOfOrigin: text,
      }),
    ),
  }),
  complianceChecklist: z.array(z.string()),
  tariffVector: z.array(
    z.strictObject({
      hsCode: text,
      source: text,
      sourceVersion: text,
      sourceUrl: z.string(),
      codeLevel: text.optional(),
      nationalSuffixUnconfirmed: z.boolean().optional(),
      datasetVersion: text.optional(),
    }),
  ),
  classification: z.strictObject({
    method: z.literal("deterministic-keyword-rules"),
    confidence: z.number().min(0).max(1),
    requiresHumanConfirmation: z.boolean(),
    rationale: z.string(),
  }),
  disclaimer: z.string(),
});

export type ParsedCustomsDocument = z.infer<typeof customsDocumentSchema>;

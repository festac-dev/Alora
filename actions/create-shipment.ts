import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { actionFail } from "../server/lib/action-error.js";
import { createShipment } from "../server/lib/commands.js";
import { actorFor, callerFor } from "../server/lib/ledger.js";

const itemSchema = z.object({
  description: z.string().min(1).describe("Human-readable goods description"),
  quantity: z.number().int().positive().describe("Number of units"),
  unitValue: z.number().positive().describe("Declared value per unit"),
  hsCode: z
    .string()
    .regex(/^\d{6,12}$/)
    .optional()
    .describe("Optional proposed HS code. Omit to let the deterministic classifier propose one."),
  weightKg: z.number().nonnegative().default(0),
  countryOfOrigin: z.string().min(2).default("CN"),
});

export default defineAction({
  description:
    "Create a cross-border shipment with one or more items. The same action is used by the UI, the in-app agent, HTTP and MCP callers; the caller is recorded in the hash-chained ledger.",
  schema: z.object({
    destination: z.enum(["DE", "US", "AE"]).describe("Destination jurisdiction"),
    currency: z.enum(["EUR", "USD", "AED"]).default("EUR"),
    origin: z.string().min(2).default("CN"),
    incoterms: z.string().default("CIF"),
    exporter: z.string().default("Shenzhen Alora Trading Co., Ltd."),
    importer: z.string().default("Northline Imports LLC"),
    shippingCost: z.number().nonnegative().default(0),
    insuranceCost: z.number().nonnegative().default(0),
    notes: z.string().optional(),
    items: z.array(itemSchema).min(1),
  }),
  outputSchema: z.object({
    id: z.string(),
    reference: z.string(),
    message: z.string(),
  }),
  run: async (input, ctx) => {
    try {
      const created = await createShipment(
        { ...input, source: callerFor(ctx) },
        { caller: callerFor(ctx), actor: actorFor(ctx) },
      );
      return {
        ...created,
        message: `${created.reference} created for ${input.destination}. Run the mission to build and verify the package.`,
      };
    } catch (error) {
      return actionFail(error);
    }
  },
});

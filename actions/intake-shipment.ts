import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { actionFail } from "../server/lib/action-error.js";
import { createIntakeShipment, parseIntake } from "../server/lib/extensions.js";
import { actorFor, callerFor } from "../server/lib/ledger.js";

export default defineAction({
  description:
    "Deterministic intake fallback: parse a messy pasted packing list or receipt into editable shipment lines, and optionally create the shipment. No model call, no auto-approval.",
  schema: z.object({
    text: z.string().min(1).describe("Pasted receipt or packing-list text"),
    destination: z.enum(["DE", "US", "AE"]).default("DE"),
    currency: z.enum(["EUR", "USD", "AED"]).default("EUR"),
    shippingCost: z.number().nonnegative().default(0),
    insuranceCost: z.number().nonnegative().default(0),
    confirm: z
      .boolean()
      .default(false)
      .describe("Set true only after a human has reviewed the extracted draft."),
  }),
  outputSchema: z.object({
    draft: z.any(),
    shipmentId: z.string().nullable(),
    reference: z.string().nullable(),
    message: z.string(),
  }),
  run: async (input, ctx) => {
    try {
      if (!input.confirm) {
        const draft = parseIntake(input.text);
        return {
          draft,
          shipmentId: null,
          reference: null,
          message: `Extracted ${draft.items.length} line(s). Review before creating the shipment.`,
        };
      }
      const created = await createIntakeShipment(input, {
        caller: callerFor(ctx),
        actor: actorFor(ctx),
      });
      return {
        draft: created.draft,
        shipmentId: created.shipmentId,
        reference: created.reference,
        message: `${created.reference} created from a human-confirmed intake draft.`,
      };
    } catch (error) {
      return actionFail(error);
    }
  },
});

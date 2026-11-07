import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { actionFail } from "../server/lib/action-error.js";
import { repairDeliverable } from "../server/lib/commands.js";
import { actorFor, callerFor } from "../server/lib/ledger.js";

export default defineAction({
  description:
    "Rebuild the customs package from the shipment and versioned tariff snapshot, producing a new immutable version. The new SHA-256 invalidates any prior approval.",
  schema: z.object({ shipmentId: z.string() }),
  outputSchema: z.object({
    deliverableId: z.string(),
    sha256: z.string(),
    version: z.number(),
    message: z.string(),
  }),
  run: async ({ shipmentId }, ctx) => {
    try {
      const result = await repairDeliverable(shipmentId, {
        caller: callerFor(ctx),
        actor: actorFor(ctx),
      });
      return {
        ...result,
        message: "New version submitted. Re-run the Verifier before approval.",
      };
    } catch (error) {
      return actionFail(error);
    }
  },
});

import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { actionFail } from "../server/lib/action-error.js";
import { runBuilder } from "../server/lib/commands.js";
import { actorFor, callerFor } from "../server/lib/ledger.js";

export default defineAction({
  description:
    "Builder agent: classify items, calculate duty/VAT/landed cost from the versioned tariff snapshot, and submit a SHA-256-locked customs package as a new immutable version.",
  schema: z.object({ shipmentId: z.string() }),
  outputSchema: z.object({
    deliverableId: z.string(),
    sha256: z.string(),
    version: z.number(),
    landedCost: z.number(),
    claimStatus: z.string(),
  }),
  run: async ({ shipmentId }, ctx) => {
    try {
      const built = await runBuilder(shipmentId, {
        caller: callerFor(ctx),
        actor: actorFor(ctx),
      });
      return {
        deliverableId: built.deliverableId,
        sha256: built.sha256,
        version: built.version,
        landedCost: built.document.totals.landedCost,
        claimStatus: "submitted",
      };
    } catch (error) {
      return actionFail(error);
    }
  },
});

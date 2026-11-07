import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { actionFail } from "../server/lib/action-error.js";
import { rewindShipment } from "../server/lib/commands.js";
import { actorFor, callerFor } from "../server/lib/ledger.js";

export default defineAction({
  description:
    "Rewind a shipment's state to a ledger entry by appending compensating events. History is preserved: nothing is deleted and the original entries remain in the hash chain.",
  schema: z.object({
    shipmentId: z.string(),
    toLedgerId: z.number().int().positive(),
  }),
  outputSchema: z.object({
    rewoundTo: z.number(),
    applied: z.array(z.string()),
    revokedApprovals: z.number(),
    message: z.string(),
  }),
  run: async ({ shipmentId, toLedgerId }, ctx) => {
    try {
      const result = await rewindShipment(
        { shipmentId, toLedgerId },
        { caller: callerFor(ctx), actor: actorFor(ctx) },
      );
      return {
        ...result,
        message:
          "Inverse events appended. Original ledger entries are still intact.",
      };
    } catch (error) {
      return actionFail(error);
    }
  },
});

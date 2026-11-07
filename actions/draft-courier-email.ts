import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { actionFail } from "../server/lib/action-error.js";
import { draftCourierEmail } from "../server/lib/extensions.js";
import { actorFor, callerFor } from "../server/lib/ledger.js";

export default defineAction({
  description:
    "Draft a courier negotiation from the verified shipment facts. This action only writes a draft; nothing is sent.",
  schema: z.object({
    shipmentId: z.string(),
    courier: z.string().min(1).default("DHL Express"),
  }),
  outputSchema: z.object({
    draftId: z.string(),
    sha256: z.string(),
    subject: z.string(),
    body: z.string(),
  }),
  run: async (input, ctx) => {
    try {
      return await draftCourierEmail(input, {
        caller: callerFor(ctx),
        actor: actorFor(ctx),
      });
    } catch (error) {
      return actionFail(error);
    }
  },
});

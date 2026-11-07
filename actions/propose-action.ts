import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { actionFail } from "../server/lib/action-error.js";
import { proposeArabicLabel } from "../server/lib/extensions.js";
import { actorFor, callerFor } from "../server/lib/ledger.js";

export default defineAction({
  description:
    "Scripted self-extension: propose a new check-arabic-label capability with a reviewed implementation, schema and reason. It stays inactive until a human approves the proposal.",
  schema: z.object({ shipmentId: z.string() }),
  outputSchema: z.object({
    proposalId: z.string(),
    message: z.string(),
  }),
  run: async ({ shipmentId }, ctx) => {
    try {
      const result = await proposeArabicLabel(
        { shipmentId },
        { caller: callerFor(ctx), actor: actorFor(ctx) },
      );
      return {
        ...result,
        message: "Proposal recorded. A human must approve it before it can run.",
      };
    } catch (error) {
      return actionFail(error);
    }
  },
});

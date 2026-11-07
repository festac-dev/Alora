import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { actionFail } from "../server/lib/action-error.js";
import { sendCourierEmail } from "../server/lib/extensions.js";
import { actorFor, callerFor } from "../server/lib/ledger.js";

export default defineAction({
  description:
    "Release an approved courier draft. Refuses unless a human approval is bound to the unchanged draft hash. The shipped transport is a mock that records the send in the ledger.",
  schema: z.object({ draftId: z.string() }),
  outputSchema: z.object({
    sent: z.boolean(),
    transport: z.string(),
    sha256: z.string(),
    message: z.string(),
  }),
  run: async ({ draftId }, ctx) => {
    try {
      const result = await sendCourierEmail(
        { draftId },
        { caller: callerFor(ctx), actor: actorFor(ctx) },
      );
      return { ...result, message: "Sent through the mock transport." };
    } catch (error) {
      return actionFail(error);
    }
  },
});

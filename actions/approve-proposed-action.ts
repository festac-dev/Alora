import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { actionFail } from "../server/lib/action-error.js";
import { approveProposedAction } from "../server/lib/extensions.js";
import { actorFor, callerFor } from "../server/lib/ledger.js";

export default defineAction({
  description:
    "Human approval of a proposed action. Activates the reviewed capability gate; no arbitrary agent-generated code is executed.",
  schema: z.object({
    proposalId: z.string(),
    approverId: z.string().optional(),
  }),
  outputSchema: z.object({
    status: z.string(),
    runtimeLoad: z.boolean(),
    message: z.string(),
  }),
  run: async (input, ctx) => {
    try {
      return await approveProposedAction(
        { ...input, approverId: input.approverId ?? null },
        {
        caller: callerFor(ctx),
        actor: actorFor(ctx),
        authenticatedApprover: ctx?.userEmail ?? null,
      });
    } catch (error) {
      return actionFail(error);
    }
  },
});

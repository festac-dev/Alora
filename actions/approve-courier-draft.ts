import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { actionFail } from "../server/lib/action-error.js";
import { approveCourierDraft } from "../server/lib/extensions.js";
import { actorFor, callerFor } from "../server/lib/ledger.js";

export default defineAction({
  description:
    "Human approval of a courier draft, bound to the draft's SHA-256. Agent identities are rejected server-side.",
  schema: z.object({
    draftId: z.string(),
    approverId: z.string().optional(),
    approverKind: z.enum(["human", "agent"]).default("human"),
  }),
  outputSchema: z.object({
    approved: z.boolean(),
    boundHash: z.string(),
    approverId: z.string(),
  }),
  run: async (input, ctx) => {
    try {
      return await approveCourierDraft(
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

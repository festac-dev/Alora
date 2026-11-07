import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { actionFail } from "../server/lib/action-error.js";
import { reviewProposedAction } from "../server/lib/extensions.js";
import { actorFor, callerFor } from "../server/lib/ledger.js";

export default defineAction({
  description:
    "Record a human review of a proposed capability template. Reviewing binds the SHA-256 of the exact stored code; activation is refused if the template changes afterwards. No arbitrary agent code is executed.",
  schema: z.object({
    proposalId: z.string(),
    approverId: z.string().optional(),
    reviewNote: z.string().optional(),
  }),
  outputSchema: z.object({
    status: z.string(),
    reviewedCodeSha256: z.string(),
    reviewedBy: z.string(),
  }),
  run: async (input, ctx) => {
    try {
      return await reviewProposedAction(
        {
          proposalId: input.proposalId,
          approverId: input.approverId ?? null,
          reviewNote: input.reviewNote ?? null,
        },
        {
          caller: callerFor(ctx),
          actor: actorFor(ctx),
          authenticatedApprover: ctx?.userEmail ?? null,
        },
      );
    } catch (error) {
      return actionFail(error);
    }
  },
});

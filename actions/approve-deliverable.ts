import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { actionFail } from "../server/lib/action-error.js";
import { approveDeliverable } from "../server/lib/commands.js";
import { actorFor, callerFor } from "../server/lib/ledger.js";

export default defineAction({
  description:
    "Human-only approval of a verified deliverable by its exact SHA-256. Rejects agent callers, stale verification and any hash change, and binds the approval to the verified bytes.",
  schema: z.object({
    shipmentId: z.string(),
    deliverableId: z.string(),
    approverId: z
      .string()
      .optional()
      .describe(
        "Optional identity assertion. The server binds approval to the authenticated operator and rejects a mismatch.",
      ),
    approverKind: z
      .enum(["human", "agent"])
      .default("human")
      .describe("Use 'agent' to prove the server rejects self-approval."),
    acknowledgeTariffBaseLevel: z
      .boolean()
      .default(false)
      .describe(
        "Required when the deliverable cites a base-level tariff row whose national suffix is unconfirmed. The acknowledgement is stored with the approval.",
      ),
  }),
  outputSchema: z.object({
    approvalId: z.string(),
    boundHash: z.string(),
    message: z.string(),
  }),
  run: async (input, ctx) => {
    try {
      const result = await approveDeliverable(
        {
          ...input,
          approverId: input.approverId ?? null,
        },
        {
          caller: callerFor(ctx),
          actor: actorFor(ctx),
          authenticatedApprover: ctx?.userEmail ?? null,
        },
      );
      return {
        ...result,
        message: "Approval bound to the verified SHA-256.",
      };
    } catch (error) {
      return actionFail(error);
    }
  },
});

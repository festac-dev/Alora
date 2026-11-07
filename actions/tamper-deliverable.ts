import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { actionFail } from "../server/lib/action-error.js";
import { tamperDeliverable } from "../server/lib/commands.js";
import { actorFor, callerFor } from "../server/lib/ledger.js";

export default defineAction({
  description:
    "Demo integrity probe: simulate an out-of-band edit of the stored deliverable bytes. The stored hash is left untouched so the mismatch is detectable; active approvals are revoked and the claim returns to verification.",
  schema: z.object({ shipmentId: z.string() }),
  outputSchema: z.object({
    detected: z.boolean(),
    expectedHash: z.string(),
    actualHash: z.string(),
    revokedApprovals: z.number(),
    message: z.string(),
  }),
  run: async ({ shipmentId }, ctx) => {
    try {
      const result = await tamperDeliverable(shipmentId, {
        caller: callerFor(ctx),
        actor: actorFor(ctx),
      });
      return {
        ...result,
        message: result.detected
          ? "Hash mismatch detected. Approval revoked; claim returned to verification."
          : "No hash mismatch was detected.",
      };
    } catch (error) {
      return actionFail(error);
    }
  },
});

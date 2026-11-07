import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { actionFail } from "../server/lib/action-error.js";
import { runVerifier } from "../server/lib/commands.js";
import { actorFor, callerFor } from "../server/lib/ledger.js";
import { verificationCheckSchema } from "../shared/customs-schema.js";

export default defineAction({
  description:
    "Verifier agent: re-hash the stored deliverable, then deterministically recompute duty, VAT, customs value, landed cost and required fields. The only action that can move a claim to verified.",
  schema: z.object({ shipmentId: z.string() }),
  outputSchema: z.object({
    runId: z.string(),
    status: z.enum(["verified", "rejected"]),
    checks: z.array(verificationCheckSchema),
    failed: z.array(z.string()),
  }),
  run: async ({ shipmentId }, ctx) => {
    try {
      const result = await runVerifier(shipmentId, {
        caller: callerFor(ctx),
        actor: actorFor(ctx),
      });
      return {
        ...result,
        failed: result.checks
          .filter((check) => (check as { status?: string }).status === "fail")
          .map((check) => (check as { id?: string }).id ?? "unknown"),
      };
    } catch (error) {
      return actionFail(error);
    }
  },
});

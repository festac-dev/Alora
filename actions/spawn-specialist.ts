import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { actionFail } from "../server/lib/action-error.js";
import { spawnSpecialist } from "../server/lib/commands.js";
import { actorFor, callerFor } from "../server/lib/ledger.js";

export default defineAction({
  description:
    "Create a country desk agent for a role and jurisdiction. Desks are real ledger-attributed agents with destination-specific tariff context.",
  schema: z.object({
    role: z.enum(["architect", "builder", "auditor", "verifier"]),
    country: z.enum(["DE", "US", "AE"]),
  }),
  outputSchema: z.object({ agentId: z.string(), message: z.string() }),
  run: async (input, ctx) => {
    try {
      const result = await spawnSpecialist(input, {
        caller: callerFor(ctx),
        actor: actorFor(ctx),
      });
      return {
        ...result,
        message: `Country desk ${result.agentId} is active.`,
      };
    } catch (error) {
      return actionFail(error);
    }
  },
});

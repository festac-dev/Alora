import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { actionFail } from "../server/lib/action-error.js";
import { runArchitect } from "../server/lib/commands.js";
import { actorFor, callerFor } from "../server/lib/ledger.js";

export default defineAction({
  description:
    "Architect agent: turn a shipment into a mission with acceptance criteria, a budget, a deadline and dependency-ordered tasks.",
  schema: z.object({ shipmentId: z.string() }),
  outputSchema: z.object({
    missionId: z.string(),
    taskCount: z.number(),
    acceptanceCriteria: z.array(z.string()),
  }),
  run: async ({ shipmentId }, ctx) => {
    try {
      return await runArchitect(shipmentId, {
        caller: callerFor(ctx),
        actor: actorFor(ctx),
      });
    } catch (error) {
      return actionFail(error);
    }
  },
});

import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { actionFail } from "../server/lib/action-error.js";
import { runAuditor } from "../server/lib/commands.js";
import { actorFor, callerFor } from "../server/lib/ledger.js";

export default defineAction({
  description:
    "Auditor agent: adversarially inspect the current customs package for unsupported totals, tariff gaps, low-confidence classification and missing disclaimers. Never approves and never changes state to verified.",
  schema: z.object({ shipmentId: z.string() }),
  outputSchema: z.object({
    findings: z.array(z.any()),
    status: z.string(),
    highSeverity: z.number(),
  }),
  run: async ({ shipmentId }, ctx) => {
    try {
      const result = await runAuditor(shipmentId, {
        caller: callerFor(ctx),
        actor: actorFor(ctx),
      });
      const findings = result.findings as Array<{ severity?: string }>;
      return {
        ...result,
        highSeverity: findings.filter((finding) => finding.severity === "high")
          .length,
      };
    } catch (error) {
      return actionFail(error);
    }
  },
});

import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { actionFail } from "../server/lib/action-error.js";
import { checkArabicLabel } from "../server/lib/extensions.js";
import { actorFor, callerFor } from "../server/lib/ledger.js";

export default defineAction({
  description:
    "Check an Arabic shipping label for Arabic script, field count and an identifier. Inactive until a human approves the proposed check-arabic-label capability.",
  schema: z.object({
    shipmentId: z.string(),
    label: z.string().min(1),
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    checks: z.array(z.string()),
    labelHash: z.string(),
  }),
  run: async (input, ctx) => {
    try {
      return await checkArabicLabel(input, {
        caller: callerFor(ctx),
        actor: actorFor(ctx),
      });
    } catch (error) {
      return actionFail(error);
    }
  },
});

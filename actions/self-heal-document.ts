import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { actionFail } from "../server/lib/action-error.js";
import { selfHealApply, selfHealPreview } from "../server/lib/extensions.js";
import { actorFor, callerFor } from "../server/lib/ledger.js";

export default defineAction({
  description:
    "Deterministic document self-heal. Preview field-level patches and confidence from the last verification, then apply to create a new immutable version. Applying always invalidates the prior approval.",
  schema: z.object({
    shipmentId: z.string(),
    apply: z.boolean().default(false),
  }),
  outputSchema: z.object({
    confidence: z.number(),
    patches: z.array(z.any()),
    requiresApproval: z.boolean(),
    note: z.string(),
    applied: z.any().nullable(),
  }),
  run: async ({ shipmentId, apply }, ctx) => {
    try {
      const preview = await selfHealPreview(shipmentId);
      const applied = apply
        ? await selfHealApply(shipmentId, {
            caller: callerFor(ctx),
            actor: actorFor(ctx),
          })
        : null;
      return { ...preview, applied };
    } catch (error) {
      return actionFail(error);
    }
  },
});

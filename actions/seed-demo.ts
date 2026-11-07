import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { callerFor, actorFor } from "../server/lib/ledger.js";
import { seedDemo } from "../server/lib/extensions.js";
import { actionFail } from "../server/lib/action-error.js";

export default defineAction({
  description:
    "Reset the workspace and install the seeded German shipment with one planted €4.20 VAT under-declaration. Use this to start or restart the Alora demo from a clean state.",
  schema: z.object({}),
  outputSchema: z.object({
    shipmentId: z.string(),
    reference: z.string(),
    verification: z.string(),
    failedChecks: z.array(z.string()),
    ledgerEntries: z.number(),
  }),
  run: async (_args, ctx) => {
    try {
      return await seedDemo({ caller: callerFor(ctx), actor: actorFor(ctx) });
    } catch (error) {
      return actionFail(error);
    }
  },
});

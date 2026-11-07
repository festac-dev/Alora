import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { actionFail } from "../server/lib/action-error.js";
import { generateDemoScript } from "../server/lib/extensions.js";

export default defineAction({
  description:
    "Generate a 3-minute demo script and click path from the real ledger. Refuses when the ledger is empty instead of inventing steps.",
  schema: z.object({}),
  http: { method: "GET" },
  outputSchema: z.object({
    script: z.string(),
    clickPath: z.array(
      z.object({
        action: z.string(),
        params: z.record(z.string(), z.unknown()),
        expect: z.string(),
      }),
    ),
    ledgerIds: z.array(z.number()),
  }),
  run: async () => {
    try {
      return await generateDemoScript();
    } catch (error) {
      return actionFail(error);
    }
  },
});

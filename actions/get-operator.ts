import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { actorFor, callerFor } from "../server/lib/ledger.js";

export default defineAction({
  description:
    "Return the authenticated operator identity and calling surface. The UI uses this to show who a human approval would be bound to; the server still enforces the identity inside approve-deliverable.",
  schema: z.object({}),
  http: { method: "GET" },
  outputSchema: z.object({
    email: z.string().nullable(),
    actor: z.string(),
    caller: z.string(),
    authenticated: z.boolean(),
  }),
  run: async (_args, ctx) => {
    const email = ctx?.userEmail ?? null;
    return {
      email,
      actor: actorFor(ctx),
      caller: callerFor(ctx),
      authenticated: Boolean(email),
    };
  },
});

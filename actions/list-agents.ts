import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { actionFail } from "../server/lib/action-error.js";
import { listAgentsWithTrust } from "../server/lib/queries.js";

export default defineAction({
  description:
    "List agents with ledger-derived trust metrics: verification pass rate, rejected runs, approvals granted (must be zero), and chain validity. Trust is computed, never self-reported.",
  schema: z.object({}),
  http: { method: "GET" },
  outputSchema: z.array(
    z.object({
      id: z.string(),
      kind: z.string(),
      role: z.string(),
      country: z.string().nullable(),
      displayName: z.string(),
      createdAt: z.string(),
      totalClaims: z.number(),
      verifiedClaims: z.number(),
      rejectedRuns: z.number(),
      approvalsGranted: z.number(),
      ledgerEntries: z.number(),
      chainValid: z.boolean(),
      trustScore: z.number(),
    }),
  ),
  run: async () => {
    try {
      return await listAgentsWithTrust();
    } catch (error) {
      return actionFail(error);
    }
  },
});

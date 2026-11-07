import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { actionFail } from "../server/lib/action-error.js";
import { surgeVerify } from "../server/lib/extensions.js";
import { actorFor, callerFor } from "../server/lib/ledger.js";

export default defineAction({
  description:
    "Run bounded parallel deterministic VAT checkers across partitions of the invoice lines. This is parallel determinism, not parallel LLM calls; cost stays zero.",
  schema: z.object({
    shipmentId: z.string(),
    workers: z.number().int().min(1).max(8).default(4),
  }),
  outputSchema: z.object({
    workers: z.number(),
    totalLines: z.number(),
    passed: z.number(),
    failed: z.number(),
    durationMs: z.number(),
    costUsd: z.number(),
    partitions: z.array(
      z.object({
        worker: z.number(),
        lines: z.number(),
        status: z.string(),
      }),
    ),
  }),
  run: async ({ shipmentId, workers }, ctx) => {
    try {
      return await surgeVerify(shipmentId, workers, {
        caller: callerFor(ctx),
        actor: actorFor(ctx),
      });
    } catch (error) {
      return actionFail(error);
    }
  },
});

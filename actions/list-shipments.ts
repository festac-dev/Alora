import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { actionFail } from "../server/lib/action-error.js";
import { listShipmentSummaries } from "../server/lib/queries.js";

export default defineAction({
  description:
    "List every shipment with its destination, claim status, latest verification result and risk colour.",
  schema: z.object({}),
  http: { method: "GET" },
  outputSchema: z.array(
    z.object({
      id: z.string(),
      reference: z.string(),
      destination: z.string(),
      status: z.string(),
      source: z.string(),
      forkedFrom: z.string().nullable(),
      createdAt: z.string(),
      itemCount: z.number(),
      units: z.number(),
      claimStatus: z.string(),
      verification: z.string(),
      risk: z.string(),
    }),
  ),
  run: async () => {
    try {
      return await listShipmentSummaries();
    } catch (error) {
      return actionFail(error);
    }
  },
});

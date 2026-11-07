import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { actionFail } from "../server/lib/action-error.js";
import { inspectShipmentIntegrity } from "../server/lib/integrity.js";
import { evidenceResultSchema } from "../shared/evidence-snapshot.js";

export default defineAction({
  description:
    "Recompute the full ledger hash chain and every deliverable hash for a shipment. This is the independent integrity check the Evidence Room shows.",
  schema: z.object({
    shipmentId: z.string().describe("Shipment id or reference"),
  }),
  http: { method: "GET" },
  outputSchema: evidenceResultSchema,
  run: async ({ shipmentId }) => {
    try {
      return await inspectShipmentIntegrity(shipmentId);
    } catch (error) {
      return actionFail(error);
    }
  },
});

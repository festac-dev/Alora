import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { actionFail } from "../server/lib/action-error.js";
import { exportShipmentManifest } from "../server/lib/commands.js";
import { manifestSchema } from "../shared/manifest.js";

export default defineAction({
  description:
    "Build an audit manifest for a shipment: every deliverable hash, approval binding, tariff source version, final ledger hash and chain validity. Download it with the UI Export button.",
  schema: z.object({
    shipmentId: z.string().describe("Shipment id or reference"),
  }),
  http: { method: "GET" },
  outputSchema: manifestSchema,
  run: async ({ shipmentId }) => {
    try {
      return await exportShipmentManifest(shipmentId);
    } catch (error) {
      return actionFail(error);
    }
  },
});

import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { actionFail } from "../server/lib/action-error.js";
import { getShipmentBundle } from "../server/lib/queries.js";
import { shipmentBundleSchema } from "../shared/bundle-schema.js";

export default defineAction({
  description:
    "Read one shipment's full evidence bundle: items, claim, deliverables and hashes, approvals, verification checks, evidence, mission, ledger, chain integrity, courier drafts and capability proposals.",
  schema: z.object({
    shipmentId: z
      .string()
      .min(1)
      .describe("Shipment id or reference, e.g. DE-2026-001"),
  }),
  http: { method: "GET" },
  outputSchema: shipmentBundleSchema,
  run: async ({ shipmentId }) => {
    try {
      const bundle = await getShipmentBundle(shipmentId);
      if (!bundle) throw new Error(`Shipment ${shipmentId} not found`);
      return shipmentBundleSchema.parse(bundle);
    } catch (error) {
      return actionFail(error);
    }
  },
});

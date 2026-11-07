import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { actionFail } from "../server/lib/action-error.js";
import { forkShipment, spawnSpecialist } from "../server/lib/commands.js";
import { actorFor, callerFor } from "../server/lib/ledger.js";

export default defineAction({
  description:
    "Fork a shipment to another destination, spawn that country's specialist desks, then rebuild and independently verify the customs package with the destination tariff snapshot.",
  schema: z.object({
    shipmentId: z.string(),
    destination: z.enum(["DE", "US", "AE"]),
    currency: z.enum(["EUR", "USD", "AED"]).optional(),
  }),
  outputSchema: z.object({
    forkId: z.string(),
    reference: z.string(),
    landedCost: z.number(),
    desks: z.array(z.string()),
    message: z.string(),
  }),
  run: async ({ shipmentId, destination, currency }, ctx) => {
    try {
      const provenance = {
        caller: callerFor(ctx),
        actor: actorFor(ctx),
      };
      const desks: string[] = [];
      for (const role of ["builder", "auditor", "verifier"]) {
        const spawned = await spawnSpecialist({ role, country: destination }, provenance);
        desks.push(spawned.agentId);
      }
      const fork = await forkShipment(
        { shipmentId, destination, currency },
        provenance,
      );
      return {
        ...fork,
        desks,
        message: `${fork.reference} forked to ${destination} with independent recalculation.`,
      };
    } catch (error) {
      return actionFail(error);
    }
  },
});

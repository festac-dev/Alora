import { canonicalJSON, sha256 } from "../server/lib/hash.ts";
import type { ItemLike, ShipmentLike } from "./alora-types.ts";

export interface VerificationInputs {
  shipment: ShipmentLike;
  items: Array<ItemLike & { currency?: string }>;
}

/** Only source fields, never mutable workflow status or timestamps. */
export function verificationInputsHash({
  shipment,
  items,
}: VerificationInputs): string {
  return sha256(
    canonicalJSON({
      shipment: {
        reference: shipment.reference,
        destination: shipment.destination,
        currency: shipment.currency,
        incoterms: shipment.incoterms,
        exporter: shipment.exporter,
        importer: shipment.importer,
        shippingCost: shipment.shippingCost,
        insuranceCost: shipment.insuranceCost,
      },
      items: items
        .map((item) => ({
          id: item.id,
          description: item.description,
          hsCode: item.hsCode,
          quantity: item.quantity,
          unitValue: item.unitValue,
          currency: item.currency ?? shipment.currency,
          weightKg: item.weightKg,
          countryOfOrigin: item.countryOfOrigin,
        }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    }),
  );
}

import { describe, expect, it } from "vitest";

import type { ItemLike, ShipmentLike } from "../../shared/alora-types";
import { buildCustomsPackage, computeLandedCost } from "./document";
import { canonicalJSON, hashBytes } from "./hash";
import { verifyPackage } from "./verification";

const shipment: ShipmentLike = {
  reference: "DE-2026-001",
  destination: "DE",
  currency: "EUR",
  incoterms: "CIF",
  exporter: "Shenzhen Alora Trading Co., Ltd.",
  importer: "Northline Imports GmbH",
  shippingCost: 420,
  insuranceCost: 85,
};

const items: ItemLike[] = [
  {
    id: "item-router",
    description: "Industrial network router, 4-port",
    hsCode: "85176200",
    hsConfidence: 0.9,
    hsRationale: "operator supplied",
    quantity: 24,
    unitValue: 185,
    weightKg: 1.8,
    countryOfOrigin: "CN",
  },
  {
    id: "item-shirt",
    description: "Cotton T-shirts, printed",
    hsCode: "61091000",
    hsConfidence: 0.9,
    hsRationale: "operator supplied",
    quantity: 120,
    unitValue: 12.5,
    weightKg: 0.2,
    countryOfOrigin: "CN",
  },
];

describe("landed cost", () => {
  it("allocates CIF charges before duty and VAT", () => {
    const result = computeLandedCost({
      destination: "DE",
      shipment,
      lines: items.map((item) => ({
        quantity: item.quantity,
        unitValue: item.unitValue,
        dutyRate: item.hsCode === "61091000" ? 0.12 : 0,
        vatRate: 0.19,
      })),
    });
    expect(result.goodsValue).toBe(5940);
    expect(result.customsValue).toBe(6445);
    expect(result.duty).toBe(195.3);
    expect(result.vat).toBe(1261.66);
    expect(result.landedCost).toBe(7901.96);
  });

  it("keeps unknown costs out of the calculation", () => {
    const result = computeLandedCost({
      destination: "DE",
      shipment: { shippingCost: 0, insuranceCost: 0 },
      lines: [{ quantity: 1, unitValue: 100, dutyRate: 0, vatRate: 0.19 }],
    });
    expect(result.landedCost).toBe(119);
  });
});

describe("customs package", () => {
  it("builds a deterministic, versioned document with cited tariffs", () => {
    const document = buildCustomsPackage({
      shipment,
      items,
      issuedAt: "2026-11-04T00:00:00.000Z",
    });
    expect(document.totals.landedCost).toBe(7901.96);
    expect(document.lines[0]?.tariffSource).toBe("EU TARIC");
    expect(document.lines[0]?.tariffUrl).toContain("ec.europa.eu");
    expect(document.classification.requiresHumanConfirmation).toBe(true);
    expect(document.disclaimer).toContain("NOT LEGAL ADVICE");
    expect(document.packingList.totalPieces).toBe(144);
  });

  it("plants a EUR 4.20 VAT under-declaration without changing line items", () => {
    const correct = buildCustomsPackage({
      shipment,
      items,
      issuedAt: "2026-11-04T00:00:00.000Z",
    });
    const planted = buildCustomsPackage({
      shipment,
      items,
      issuedAt: "2026-11-04T00:00:00.000Z",
      plantedVatError: true,
    });
    expect(planted.totals.vat).toBe(correct.totals.vat - 4.2);
    expect(planted.totals.landedCost).toBe(correct.totals.landedCost - 4.2);
    expect(planted.lines.map((line) => line.vat)).toEqual(
      correct.lines.map((line) => line.vat),
    );
  });

  it("keeps totals consistent with cent-rounded line allocations", () => {
    const document = buildCustomsPackage({
      shipment: { ...shipment, shippingCost: 80, insuranceCost: 20 },
      items: [
        { ...items[0]!, id: "a", hsCode: "85176200", quantity: 1, unitValue: 100 },
        { ...items[0]!, id: "b", hsCode: "85176200", quantity: 1, unitValue: 100 },
        { ...items[0]!, id: "c", hsCode: "85176200", quantity: 1, unitValue: 100 },
      ],
    });
    const lineVat = document.lines.reduce((sum, line) => sum + line.vat, 0);
    const lineDuty = document.lines.reduce((sum, line) => sum + line.duty, 0);
    expect(document.totals.vat).toBe(Number(lineVat.toFixed(2)));
    expect(document.totals.duty).toBe(Number(lineDuty.toFixed(2)));
    expect(
      document.lines.reduce((sum, line) => sum + line.allocatedCharges, 0),
    ).toBeCloseTo(100, 2);
    const computed = computeLandedCost({
      destination: "DE",
      shipment: { ...shipment, shippingCost: 80, insuranceCost: 20 },
      lines: document.lines.map((line) => ({
        quantity: line.quantity,
        unitValue: line.unitValue,
        dutyRate: line.dutyRate,
        vatRate: line.vatRate,
      })),
    });
    expect(computed.customsValue).toBe(document.totals.customsValue);
    expect(computed.landedCost).toBe(document.totals.landedCost);
    const result = verifyPackage({
      document,
      bytes: canonicalJSON(document),
      storedSha256: hashBytes(canonicalJSON(document)),
      jurisdiction: "DE",
    });
    expect(result.status).toBe("verified");
  });

  it("marks an unclassified item as missing a tariff row", () => {
    const document = buildCustomsPackage({
      shipment,
      items: [
        {
          ...items[0]!,
          id: "unknown",
          description: "Mystery object",
          hsCode: null,
        },
      ],
    });
    expect(document.lines[0]?.tariffMissing).toBe(true);
    expect(document.lines[0]?.hsCode).toBe("UNCLASSIFIED");
  });
});

import type {
  CustomsDocument,
  ItemLike,
  ShipmentLike,
  TariffRowData,
} from "../../shared/alora-types.js";
import { findTariff, DISCLAIMER, datasetVersionFor } from "./tariffs.ts";

export function round2(value: number): number {
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function classifyDescription(description: string): {
  hsCode: string | null;
  confidence: number;
  rationale: string;
} {
  const text = description.toLowerCase();
  if (
    /(router|switch|telephone|smartphone|wireless|modem|network|electronic|component|adapter|cable)/.test(
      text,
    )
  ) {
    return {
      hsCode: "85176200",
      confidence: 0.82,
      rationale:
        "Keyword rule matched network/telecommunication apparatus. Heading 8517 covers reception, conversion and transmission of data. Confirm the exact subheading against the device datasheet.",
    };
  }
  if (
    /(t-?shirt|shirt|textile|cotton|apparel|garment|vest|singlet)/.test(text)
  ) {
    return {
      hsCode: "61091000",
      confidence: 0.76,
      rationale:
        "Keyword rule matched a knitted cotton garment. Chapter 61 covers knitted apparel; 6109.10 covers cotton T-shirts and vests. Fibre content and knit/woven construction must be confirmed.",
    };
  }
  if (/(tile|ceramic|porcelain|stoneware|flagstone)/.test(text)) {
    return {
      hsCode: "69072100",
      confidence: 0.71,
      rationale:
        "Keyword rule matched a glazed ceramic tile. Water absorption must be confirmed to choose between 6907.21 and adjacent subheadings.",
    };
  }
  return {
    hsCode: null,
    confidence: 0.2,
    rationale:
      "No deterministic classification rule matched this description. A human must assign the HS code before declaration.",
  };
}

function lineTariff(
  destination: string,
  hsCode: string | null,
): TariffRowData | null {
  return findTariff(destination, hsCode);
}

/**
 * Allocate freight + insurance pro rata by line value, rounded to cents, with
 * the last line carrying the residual so the allocations always reconcile to
 * the charge pool. Both the builder and the verifier use this exact rule.
 */
export function allocateCharges(
  lineTotals: number[],
  goodsValue: number,
  chargePool: number,
): number[] {
  if (lineTotals.length === 0) return [];
  const allocations = lineTotals.map((lineTotal) =>
    goodsValue > 0 ? round2((chargePool * lineTotal) / goodsValue) : 0,
  );
  const lastIndex = allocations.length - 1;
  const allocated = round2(
    allocations.reduce((total, value) => total + value, 0),
  );
  allocations[lastIndex] = round2(
    (allocations[lastIndex] ?? 0) + (chargePool - allocated),
  );
  return allocations;
}

export function computeLandedCost(input: {
  destination: string;
  shipment: Pick<ShipmentLike, "shippingCost" | "insuranceCost">;
  lines: Array<{
    quantity: number;
    unitValue: number;
    dutyRate: number;
    vatRate: number;
  }>;
}): {
  goodsValue: number;
  shipping: number;
  insurance: number;
  customsValue: number;
  duty: number;
  vat: number;
  landedCost: number;
} {
  const goodsValue = round2(
    input.lines.reduce(
      (total, line) => total + line.quantity * line.unitValue,
      0,
    ),
  );
  const shipping = round2(input.shipment.shippingCost);
  const insurance = round2(input.shipment.insuranceCost);
  const customsValue = round2(goodsValue + shipping + insurance);
  const chargePool = round2(shipping + insurance);
  // Recompute exactly the same cent-rounded line values the document stores.
  // Summing unrounded pro-rata allocations here can differ by one cent from the
  // document's line sums and make a correct package permanently fail the
  // verifier's total checks.
  const lineTotals = input.lines.map((line) =>
    round2(line.quantity * line.unitValue),
  );
  const allocations = allocateCharges(lineTotals, goodsValue, chargePool);
  const roundedLines = input.lines.map((line, index) => {
    const lineCustoms = round2(
      (lineTotals[index] ?? 0) + (allocations[index] ?? 0),
    );
    const lineDuty = round2(lineCustoms * line.dutyRate);
    const lineVat = round2((lineCustoms + lineDuty) * line.vatRate);
    return { lineDuty, lineVat };
  });
  const duty = round2(
    roundedLines.reduce((total, line) => total + line.lineDuty, 0),
  );
  const vat = round2(
    roundedLines.reduce((total, line) => total + line.lineVat, 0),
  );
  return {
    goodsValue,
    shipping,
    insurance,
    customsValue,
    duty,
    vat,
    landedCost: round2(customsValue + duty + vat),
  };
}

export function buildCustomsPackage(input: {
  shipment: ShipmentLike;
  items: ItemLike[];
  issuedAt?: string;
  plantedVatError?: boolean | undefined;
}): CustomsDocument {
  const { shipment, items } = input;
  const destination = shipment.destination;
  const goodsValue = round2(
    items.reduce((total, item) => total + item.quantity * item.unitValue, 0),
  );
  const chargePool = round2(shipment.shippingCost + shipment.insuranceCost);
  const lineTotals = items.map((item) =>
    round2(item.quantity * item.unitValue),
  );
  const allocations = allocateCharges(lineTotals, goodsValue, chargePool);

  const lines = items.map((item, index) => {
    const proposed = item.hsCode
      ? {
          hsCode: item.hsCode,
          confidence: item.hsConfidence ?? 0.5,
          rationale: item.hsRationale ?? "HS code supplied by the operator.",
        }
      : classifyDescription(item.description);
    const tariff = lineTariff(destination, proposed.hsCode);
    const lineTotal = lineTotals[index] ?? 0;
    const allocatedCharges = allocations[index] ?? 0;
    const customsValue = round2(lineTotal + allocatedCharges);
    const dutyRate = tariff?.dutyRate ?? 0;
    const vatRate = tariff?.vatRate ?? 0;
    const duty = round2(customsValue * dutyRate);
    const vat = round2((customsValue + duty) * vatRate);
    return {
      itemId: item.id,
      description: item.description,
      hsCode: proposed.hsCode ?? "UNCLASSIFIED",
      quantity: item.quantity,
      unitValue: round2(item.unitValue),
      lineTotal,
      allocatedCharges,
      customsValue,
      dutyRate,
      vatRate,
      duty,
      vat,
      tariffSource: tariff?.source ?? "Unavailable — confirm with customs",
      tariffVersion: tariff?.sourceVersion ?? "unavailable",
      tariffUrl: tariff?.sourceUrl ?? "",
      tariffCodeLevel: tariff?.codeLevel ?? "unavailable",
      tariffNationalSuffixUnconfirmed:
        tariff?.nationalSuffixUnconfirmed ?? false,
      tariffDatasetVersion: tariff?.datasetVersion ?? "unavailable",
      tariffMissing: !tariff,
      _confidence: proposed.confidence,
      _rationale: proposed.rationale,
    };
  });

  const totals = {
    goodsValue: round2(
      lines.reduce((total, line) => total + line.lineTotal, 0),
    ),
    shipping: round2(shipment.shippingCost),
    insurance: round2(shipment.insuranceCost),
    customsValue: round2(
      lines.reduce((total, line) => total + line.customsValue, 0),
    ),
    duty: round2(lines.reduce((total, line) => total + line.duty, 0)),
    vat: round2(lines.reduce((total, line) => total + line.vat, 0)),
    landedCost: round2(
      lines.reduce((total, line) => total + line.customsValue, 0) +
        lines.reduce((total, line) => total + line.duty, 0) +
        lines.reduce((total, line) => total + line.vat, 0),
    ),
  };

  const adjustedVat = input.plantedVatError
    ? round2(totals.vat - 4.2)
    : totals.vat;
  const adjustedLanded = input.plantedVatError
    ? round2(totals.landedCost - 4.2)
    : totals.landedCost;

  const minConfidence = Math.min(...lines.map((line) => line._confidence));
  const primaryRationale = lines[0]?._rationale ?? "No lines.";
  const tariffVector = Array.from(
    new Map(
      lines
        .filter((line) => !line.tariffMissing)
        .map((line) => [
          line.hsCode,
          {
            hsCode: line.hsCode,
            source: line.tariffSource,
            sourceVersion: line.tariffVersion,
            sourceUrl: line.tariffUrl,
            codeLevel: line.tariffCodeLevel,
            nationalSuffixUnconfirmed: line.tariffNationalSuffixUnconfirmed,
            datasetVersion: line.tariffDatasetVersion,
          },
        ]),
    ).values(),
  );

  return {
    document: "customs-package",
    schemaVersion: 1,
    shipmentRef: shipment.reference,
    destination,
    currency: shipment.currency,
    incoterms: shipment.incoterms,
    exporter: shipment.exporter,
    importer: shipment.importer,
    issuedAt: input.issuedAt ?? new Date().toISOString(),
    lines: lines.map(
      ({ _confidence: _confidence, _rationale: _rationale, ...line }) => line,
    ),
    totals: {
      ...totals,
      vat: adjustedVat,
      landedCost: adjustedLanded,
    },
    packingList: {
      totalPieces: items.reduce((total, item) => total + item.quantity, 0),
      totalWeightKg: round2(
        items.reduce((total, item) => total + item.weightKg, 0),
      ),
      lines: items.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        weightKg: round2(item.weightKg),
        countryOfOrigin: item.countryOfOrigin,
      })),
    },
    complianceChecklist: [
      `Commercial invoice present and denominated in ${shipment.currency}.`,
      `Packing list reconciles ${items.reduce((total, item) => total + item.quantity, 0)} pieces.`,
      `Tariff snapshot ${datasetVersionFor(destination)} recorded for every classified line.`,
      "Origin declared for every item.",
      `Incoterms recorded as ${shipment.incoterms}.`,
      "Human classification confirmation required before release.",
      "Restrictions and licensing must be checked by a licensed broker.",
    ],
    tariffVector,
    classification: {
      method: "deterministic-keyword-rules",
      confidence: Number.isFinite(minConfidence) ? minConfidence : 0,
      requiresHumanConfirmation: minConfidence < 0.95,
      rationale: primaryRationale,
    },
    disclaimer: DISCLAIMER,
  };
}

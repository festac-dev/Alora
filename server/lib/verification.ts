import type {
  CustomsDocument,
  VerificationCheck,
} from "../../shared/alora-types.js";
import { customsDocumentSchema } from "../../shared/customs-schema.ts";
import type { VerificationInputs } from "../../shared/verification-inputs.js";
import { allocateCharges, round2 } from "./document.ts";
import { hashBytes } from "./hash.ts";
import { resolveCitedTariff, tariffRequirements } from "./tariffs.ts";

export const VERIFICATION_POLICY_VERSION = 2;

export function unconfirmedTariffCodes(document: CustomsDocument): string[] {
  return tariffRequirements(document).unconfirmedCodes;
}

/** Hash and parse the stored bytes; a detached caller-supplied object is never proof. */
export function verifyPackage(input: {
  document?: unknown;
  bytes: string;
  storedSha256: string;
  jurisdiction: string;
  expected?: VerificationInputs;
}): { checks: VerificationCheck[]; status: "verified" | "rejected" } {
  const checks: VerificationCheck[] = [];
  const add = (
    id: string,
    label: string,
    ok: boolean,
    expected: string | number,
    actual: string | number,
    detail = label,
  ) => {
    checks.push({
      id,
      label,
      status: ok ? "pass" : "fail",
      expected,
      actual,
      detail,
    });
  };
  const amount = (
    id: string,
    label: string,
    expected: number,
    actual: number,
  ) => {
    add(
      id,
      label,
      Number.isFinite(expected) && round2(expected) === actual,
      expected,
      actual,
    );
  };
  const finish = () => ({
    checks,
    status: checks.some((check) => check.status === "fail")
      ? ("rejected" as const)
      : ("verified" as const),
  });
  const actualHash = hashBytes(input.bytes);
  add(
    "hash-integrity",
    "Deliverable bytes match the submitted SHA-256",
    actualHash === input.storedSha256,
    input.storedSha256,
    actualHash,
  );

  let value: unknown;
  try {
    value = JSON.parse(input.bytes);
  } catch {
    add(
      "document-schema",
      "Stored bytes are a customs package",
      false,
      "valid JSON",
      "invalid JSON",
    );
    return finish();
  }
  const parsed = customsDocumentSchema.safeParse(value);
  if (!parsed.success) {
    add(
      "document-schema",
      "Stored bytes are a customs package",
      false,
      "schema version 1",
      parsed.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ")
        .slice(0, 1000),
    );
    return finish();
  }
  const document = parsed.data;
  add(
    "required-fields",
    "Required invoice fields are present",
    true,
    "all present",
    "all present",
  );
  add(
    "destination",
    "Document destination matches the shipment",
    document.destination === input.jurisdiction,
    input.jurisdiction,
    document.destination,
  );
  add(
    "line-items",
    "Commercial invoice has at least one line",
    document.lines.length > 0,
    "one or more",
    document.lines.length,
  );
  const ids = document.lines.map((line) => line.itemId);
  add(
    "unique-items",
    "Each item occurs exactly once",
    new Set(ids).size === ids.length,
    ids.length,
    new Set(ids).size,
  );

  const source = input.expected;
  const itemById = new Map(source?.items.map((item) => [item.id, item]));
  if (source) {
    const expectedIds = source.items.map((item) => item.id).sort();
    add(
      "input-items",
      "Invoice contains exactly the stored shipment items",
      JSON.stringify([...ids].sort()) === JSON.stringify(expectedIds),
      expectedIds.join(","),
      [...ids].sort().join(","),
    );
    const fields = [
      "destination",
      "currency",
      "incoterms",
      "exporter",
      "importer",
    ] as const;
    add(
      "input-reference",
      "Invoice reference matches the shipment",
      document.shipmentRef === source.shipment.reference,
      source.shipment.reference,
      document.shipmentRef,
    );
    for (const field of fields) {
      add(
        `input-${field}`,
        `Invoice ${field} matches the shipment`,
        document[field] === source.shipment[field],
        source.shipment[field],
        document[field],
      );
    }
    for (const line of document.lines) {
      const item = itemById.get(line.itemId);
      if (!item) continue;
      add(
        `input:${line.itemId}`,
        "Invoice line matches the stored item",
        line.description === item.description &&
          line.quantity === item.quantity &&
          line.unitValue === round2(item.unitValue) &&
          line.hsCode === item.hsCode &&
          (!item.currency || item.currency === source.shipment.currency),
        "stored description, quantity, price, code and currency",
        "compared with shipment item",
      );
    }
  } else {
    checks.push({
      id: "input-binding",
      label: "Shipment inputs are required for approval",
      status: "warn",
      detail:
        "Only document consistency was checked. Persisted verification must also supply the shipment inputs.",
    });
  }

  const lineTotals = document.lines.map((line) => {
    const item = itemById.get(line.itemId);
    return round2(
      (item?.quantity ?? line.quantity) * (item?.unitValue ?? line.unitValue),
    );
  });
  const goods = round2(lineTotals.reduce((sum, total) => sum + total, 0));
  const shipping = round2(
    source?.shipment.shippingCost ?? document.totals.shipping,
  );
  const insurance = round2(
    source?.shipment.insuranceCost ?? document.totals.insurance,
  );
  amount(
    "goods-total",
    "Goods value is the sum of quantity × unit value",
    goods,
    document.totals.goodsValue,
  );
  amount(
    "shipping-total",
    "Freight matches the shipment",
    shipping,
    document.totals.shipping,
  );
  amount(
    "insurance-total",
    "Insurance matches the shipment",
    insurance,
    document.totals.insurance,
  );
  const allocations = allocateCharges(
    lineTotals,
    goods,
    round2(shipping + insurance),
  );
  let dutyTotal = 0;
  let vatTotal = 0;
  const resolvedCodes = new Set<string>();
  for (const [index, line] of document.lines.entries()) {
    const total = lineTotals[index]!;
    amount(
      `line-total:${line.itemId}`,
      "Line total is quantity × unit value",
      total,
      line.lineTotal,
    );
    const allocated = allocations[index]!;
    amount(
      `allocation:${line.itemId}`,
      "Freight and insurance are allocated by goods value",
      allocated,
      line.allocatedCharges,
    );
    const customs = round2(total + allocated);
    amount(
      `customs-value:${line.itemId}`,
      "Customs value is goods plus allocated charges",
      customs,
      line.customsValue,
    );
    const tariff = resolveCitedTariff(input.jurisdiction, line);
    add(
      `tariff:${line.itemId}`,
      `Cited tariff version exists for ${line.hsCode}`,
      Boolean(tariff),
      line.tariffVersion,
      tariff?.sourceVersion ?? "unavailable or ambiguous",
    );
    if (!tariff) continue;
    resolvedCodes.add(line.hsCode);
    add(
      `rate:${line.itemId}`,
      "Declared rates exactly match the cited tariff",
      line.dutyRate === tariff.dutyRate &&
        line.vatRate === (tariff.vatRate ?? 0),
      `${tariff.dutyRate}/${tariff.vatRate ?? 0}`,
      `${line.dutyRate}/${line.vatRate}`,
    );
    add(
      `tariff-provenance:${line.itemId}`,
      "Tariff provenance matches the trusted snapshot",
      !line.tariffMissing &&
        line.tariffUrl === tariff.sourceUrl &&
        (line.tariffCodeLevel === undefined ||
          line.tariffCodeLevel === tariff.codeLevel) &&
        (line.tariffNationalSuffixUnconfirmed === undefined ||
          line.tariffNationalSuffixUnconfirmed ===
            tariff.nationalSuffixUnconfirmed),
      "cited source and tariff level",
      line.tariffCodeLevel ?? "legacy metadata",
    );
    const duty = round2(customs * tariff.dutyRate);
    const vat = round2((customs + duty) * (tariff.vatRate ?? 0));
    amount(
      `duty:${line.itemId}`,
      "Duty is recomputed from the trusted rate",
      duty,
      line.duty,
    );
    amount(
      `vat:${line.itemId}`,
      "VAT is recomputed from customs value and recomputed duty",
      vat,
      line.vat,
    );
    dutyTotal += duty;
    vatTotal += vat;
  }
  dutyTotal = round2(dutyTotal);
  vatTotal = round2(vatTotal);
  const customsTotal = round2(goods + shipping + insurance);
  amount(
    "duty-total",
    "Total duty reconciles to recomputed line duties",
    dutyTotal,
    document.totals.duty,
  );
  amount(
    "vat-total",
    "Total VAT reconciles to recomputed line VAT",
    vatTotal,
    document.totals.vat,
  );
  amount(
    "customs-value-total",
    "Customs value equals goods + freight + insurance",
    customsTotal,
    document.totals.customsValue,
  );
  amount(
    "landed-cost",
    "Landed cost uses independently recomputed amounts",
    round2(customsTotal + dutyTotal + vatTotal),
    document.totals.landedCost,
  );

  const vectorCodes = document.tariffVector.map((row) => row.hsCode);
  add(
    "tariff-vector",
    "Tariff vector contains the cited rows exactly once",
    JSON.stringify([...vectorCodes].sort()) ===
      JSON.stringify([...resolvedCodes].sort()),
    [...resolvedCodes].sort().join(","),
    [...vectorCodes].sort().join(","),
  );
  for (const row of document.tariffVector) {
    const tariff = resolveCitedTariff(input.jurisdiction, {
      hsCode: row.hsCode,
      tariffSource: row.source,
      tariffVersion: row.sourceVersion,
      tariffDatasetVersion: row.datasetVersion,
    });
    add(
      `tariff-vector:${row.hsCode}`,
      "Tariff vector agrees with the trusted source",
      Boolean(
        tariff &&
        row.sourceUrl === tariff.sourceUrl &&
        (row.codeLevel === undefined || row.codeLevel === tariff.codeLevel) &&
        (row.nationalSuffixUnconfirmed === undefined ||
          row.nationalSuffixUnconfirmed === tariff.nationalSuffixUnconfirmed),
      ),
      "trusted tariff provenance",
      row.sourceVersion,
    );
  }

  const pieces = document.lines.reduce(
    (sum, line) => sum + (itemById.get(line.itemId)?.quantity ?? line.quantity),
    0,
  );
  add(
    "packing-pieces",
    "Packing list reconciles the invoice quantities",
    document.packingList.totalPieces === pieces,
    pieces,
    document.packingList.totalPieces,
  );
  add(
    "packing-lines",
    "Packing list contains every invoice line",
    document.packingList.lines.length === document.lines.length,
    document.lines.length,
    document.packingList.lines.length,
  );
  for (const [index, line] of document.lines.entries()) {
    const packed = document.packingList.lines[index];
    const item = itemById.get(line.itemId);
    add(
      `packing:${line.itemId}`,
      "Packing line matches its shipment item",
      Boolean(
        packed &&
        packed.description === (item?.description ?? line.description) &&
        packed.quantity === (item?.quantity ?? line.quantity) &&
        (!item ||
          (packed.countryOfOrigin === item.countryOfOrigin &&
            packed.weightKg === round2(item.weightKg))),
      ),
      "stored packing fields",
      packed ? "compared with invoice and shipment" : "missing",
    );
  }
  const weight = round2(
    source
      ? source.items.reduce((sum, item) => sum + round2(item.weightKg), 0)
      : document.packingList.lines.reduce(
          (sum, line) => sum + line.weightKg,
          0,
        ),
  );
  amount(
    "packing-weight",
    "Packing weight reconciles its lines",
    weight,
    document.packingList.totalWeightKg,
  );

  checks.push({
    id: "classification-review",
    label: "HS classification needs human confirmation",
    status: "warn",
    detail: `Classification confidence ${(document.classification.confidence * 100).toFixed(0)}%. A tariff lookup proves a code exists, not that it is the correct code.`,
    expected: "human confirmation",
    actual: "required",
  });
  const requirements = tariffRequirements(document, input.jurisdiction);
  if (requirements.unconfirmedCodes.length) {
    checks.push({
      id: "tariff-line-level",
      label: "National tariff suffix is unconfirmed",
      status: "warn",
      detail: `The trusted tariff snapshot contains base-level codes ${requirements.unconfirmedCodes.join(", ")}. Confirm the national suffix or explicitly acknowledge the base-level estimate before approval.`,
      expected: "national suffix confirmed",
      actual: requirements.unconfirmedCodes.join(", "),
    });
  }
  add(
    "disclaimer",
    "Estimate disclaimer is attached",
    document.disclaimer.includes("ESTIMATE") &&
      document.disclaimer.includes("NOT LEGAL ADVICE"),
    "ESTIMATE / NOT LEGAL ADVICE",
    document.disclaimer.slice(0, 40),
  );
  return finish();
}

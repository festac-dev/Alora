import { describe, expect, it } from "vitest";

import type { ItemLike, ShipmentLike } from "../../shared/alora-types";
import { auditPackage } from "./auditor";
import { buildCustomsPackage, round2 } from "./document";
import { canonicalJSON, hashBytes } from "./hash";
import { verifyPackage, unconfirmedTariffCodes } from "./verification";

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
    id: "router",
    description: "Industrial network router",
    hsCode: "85176200",
    hsConfidence: 0.9,
    hsRationale: "operator",
    quantity: 24,
    unitValue: 185,
    weightKg: 1.8,
    countryOfOrigin: "CN",
  },
  {
    id: "shirt",
    description: "Cotton T-shirts",
    hsCode: "61091000",
    hsConfidence: 0.9,
    hsRationale: "operator",
    quantity: 120,
    unitValue: 12.5,
    weightKg: 0.2,
    countryOfOrigin: "CN",
  },
];

function fixture(plantedVatError = false) {
  const document = buildCustomsPackage({
    shipment,
    items,
    issuedAt: "2026-11-04T00:00:00.000Z",
    plantedVatError,
  });
  const bytes = canonicalJSON(document);
  return { document, bytes, sha256: hashBytes(bytes) };
}

describe("deterministic verifier", () => {
  const verify = (
    document: ReturnType<typeof buildCustomsPackage>,
    bindInputs = false,
  ) => {
    const bytes = canonicalJSON(document);
    return verifyPackage({
      bytes,
      storedSha256: hashBytes(bytes),
      jurisdiction: document.destination,
      ...(bindInputs ? { expected: { shipment, items } } : {}),
    });
  };

  it("recomputes quantity times unit value instead of trusting a declared line total", () => {
    const { document } = fixture();
    document.lines[0]!.quantity *= 10;
    const result = verify(document);
    expect(result.status).toBe("rejected");
    expect(
      result.checks.find((check) => check.id === "line-total:router")?.status,
    ).toBe("fail");
  });

  it("rejects a subtly wrong rate even when the declared arithmetic agrees", () => {
    const { document } = fixture();
    const line = document.lines[1]!;
    line.dutyRate = 0.116;
    line.duty = round2(line.customsValue * line.dutyRate);
    line.vat = round2((line.customsValue + line.duty) * line.vatRate);
    document.totals.duty = round2(
      document.lines.reduce((sum, entry) => sum + entry.duty, 0),
    );
    document.totals.vat = round2(
      document.lines.reduce((sum, entry) => sum + entry.vat, 0),
    );
    document.totals.landedCost = round2(
      document.totals.customsValue + document.totals.duty + document.totals.vat,
    );
    const result = verify(document);
    expect(result.status).toBe("rejected");
    expect(
      result.checks.find((check) => check.id === "rate:shirt")?.status,
    ).toBe("fail");
    expect(
      result.checks.find((check) => check.id === "duty:shirt")?.status,
    ).toBe("fail");
  });

  it("binds a self-consistent package to the persisted shipment inputs", () => {
    const document = buildCustomsPackage({
      shipment: { ...shipment, currency: "USD", shippingCost: 0 },
      items: [{ ...items[0]!, quantity: 1 }],
    });
    expect(verify(document, true).status).toBe("rejected");
    expect(verify(fixture().document, true).status).toBe("verified");
  });

  it("rejects duplicate items and a missing packing line", () => {
    const { document } = fixture();
    document.lines[1]!.itemId = document.lines[0]!.itemId;
    document.packingList.lines.pop();
    const result = verify(document, true);
    expect(
      result.checks.find((check) => check.id === "unique-items")?.status,
    ).toBe("fail");
    expect(
      result.checks.find((check) => check.id === "packing-lines")?.status,
    ).toBe("fail");
  });

  it("rejects malformed bytes without throwing or trusting a detached document", () => {
    for (const bytes of ["not JSON", "{}", '{"lines":null}']) {
      expect(
        verifyPackage({
          document: fixture().document,
          bytes,
          storedSha256: hashBytes(bytes),
          jurisdiction: "DE",
        }).status,
      ).toBe("rejected");
    }
  });

  it("resolves legacy UAE consent from the tariff, even without document metadata", () => {
    const document = buildCustomsPackage({
      shipment: { ...shipment, destination: "AE" },
      items,
    });
    for (const line of document.lines) {
      delete line.tariffNationalSuffixUnconfirmed;
      delete line.tariffCodeLevel;
      delete line.tariffDatasetVersion;
    }
    for (const row of document.tariffVector) {
      delete row.nationalSuffixUnconfirmed;
      delete row.codeLevel;
      delete row.datasetVersion;
    }
    expect(unconfirmedTariffCodes(document)).toEqual(["61091000", "85176200"]);
    expect(
      verify(document).checks.find((check) => check.id === "tariff-line-level")
        ?.status,
    ).toBe("warn");
    document.lines[0]!.tariffNationalSuffixUnconfirmed = false;
    expect(verify(document).status).toBe("rejected");
    expect(unconfirmedTariffCodes(document)).toContain("85176200");
  });

  it("rejects unavailable cited versions instead of using current rates", () => {
    const { document } = fixture();
    document.lines[0]!.tariffVersion = "unavailable old snapshot";
    expect(
      verify(document).checks.find((check) => check.id === "tariff:router")
        ?.status,
    ).toBe("fail");
  });
  it("passes a correct package", () => {
    const { document, bytes, sha256 } = fixture();
    const result = verifyPackage({
      document,
      bytes,
      storedSha256: sha256,
      jurisdiction: "DE",
    });
    expect(result.status).toBe("verified");
    expect(result.checks.some((check) => check.status === "fail")).toBe(false);
    expect(
      result.checks.find((check) => check.id === "classification-review")
        ?.status,
    ).toBe("warn");
  });

  it("rejects the planted VAT mismatch", () => {
    const { document, bytes, sha256 } = fixture(true);
    const result = verifyPackage({
      document,
      bytes,
      storedSha256: sha256,
      jurisdiction: "DE",
    });
    expect(result.status).toBe("rejected");
    expect(
      result.checks.find((check) => check.id === "vat-total")?.status,
    ).toBe("fail");
  });

  it("rejects bytes that do not match the stored hash", () => {
    const { document, bytes } = fixture();
    const result = verifyPackage({
      document,
      bytes,
      storedSha256: "0".repeat(64),
      jurisdiction: "DE",
    });
    expect(result.status).toBe("rejected");
    expect(
      result.checks.find((check) => check.id === "hash-integrity")?.status,
    ).toBe("fail");
  });

  it("rejects a missing tariff row", () => {
    const document = buildCustomsPackage({
      shipment: { ...shipment, destination: "AE" },
      items: [{ ...items[0]!, hsCode: "99999999", description: "Unknown" }],
    });
    const bytes = canonicalJSON(document);
    const result = verifyPackage({
      document,
      bytes,
      storedSha256: hashBytes(bytes),
      jurisdiction: "AE",
    });
    expect(
      result.checks.find((check) => check.id === "tariff:router")?.status,
    ).toBe("fail");
  });

  it("warns, without failing, when the stored tariff row is a base-level code", () => {
    const document = buildCustomsPackage({
      shipment: { ...shipment, destination: "AE", currency: "AED" },
      items,
    });
    const bytes = canonicalJSON(document);
    const result = verifyPackage({
      document,
      bytes,
      storedSha256: hashBytes(bytes),
      jurisdiction: "AE",
    });
    expect(result.status).toBe("verified");
    expect(
      result.checks.find((check) => check.id === "tariff-line-level")?.status,
    ).toBe("warn");
  });

  it("does not warn about the national suffix for a declared-level dataset", () => {
    const { document, bytes, sha256 } = fixture();
    const result = verifyPackage({
      document,
      bytes,
      storedSha256: sha256,
      jurisdiction: "DE",
    });
    expect(
      result.checks.find((check) => check.id === "tariff-line-level"),
    ).toBeUndefined();
  });

  it("lists the distinct base-level codes that need an approval acknowledgement", () => {
    const ae = buildCustomsPackage({
      shipment: { ...shipment, destination: "AE", currency: "AED" },
      items,
    });
    expect(unconfirmedTariffCodes(ae)).toEqual(["61091000", "85176200"]);

    const de = buildCustomsPackage({ shipment, items });
    expect(unconfirmedTariffCodes(de)).toEqual([]);
  });

  it("rejects a document with the disclaimer removed", () => {
    const { document, bytes, sha256 } = fixture();
    const tampered = { ...document, disclaimer: "Nothing to see here." };
    const tamperedBytes = canonicalJSON(tampered);
    const result = verifyPackage({
      document: tampered,
      bytes: tamperedBytes,
      storedSha256: sha256,
      jurisdiction: "DE",
    });
    expect(result.status).toBe("rejected");
    expect(
      result.checks.find((check) => check.id === "disclaimer")?.status,
    ).toBe("fail");
  });
});

describe("adversarial auditor", () => {
  it("finds the planted VAT mismatch independently", () => {
    const { document } = fixture(true);
    const result = auditPackage(document);
    expect(result.status).toBe("issues");
    expect(
      result.findings.some((finding) => finding.id === "vat-mismatch"),
    ).toBe(true);
  });

  it("finds no high-severity issues in a clean package", () => {
    const { document } = fixture();
    const result = auditPackage(document);
    expect(
      result.findings.filter((finding) => finding.severity === "high"),
    ).toHaveLength(0);
  });
});

import { describe, expect, it } from "vitest";

import { TARIFF_DATA, findTariff, rowsFor } from "./tariffs";

describe("frozen tariff snapshots", () => {
  it("declares the code level of every stored row", () => {
    for (const row of TARIFF_DATA) {
      expect(row.codeLevel.length).toBeGreaterThan(0);
      expect(typeof row.nationalSuffixUnconfirmed).toBe("boolean");
      expect(row.sourceUrl).toMatch(/^https:\/\//);
    }
  });

  it("marks the GCC rows as base level with an unconfirmed national suffix", () => {
    const rows = rowsFor("AE");
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.codeLevel).toBe("GCC/HS 8-digit base");
      expect(row.nationalSuffixUnconfirmed).toBe(true);
      expect(row.hsCode).toHaveLength(8);
    }
  });

  it("does not flag the German and US rows as base level", () => {
    for (const jurisdiction of ["DE", "US"]) {
      for (const row of rowsFor(jurisdiction)) {
        expect(row.nationalSuffixUnconfirmed).toBe(false);
      }
    }
  });

  it("resolves a row by jurisdiction and HS code", () => {
    expect(findTariff("AE", "85176200")?.nationalSuffixUnconfirmed).toBe(true);
    expect(findTariff("DE", "85176200")?.nationalSuffixUnconfirmed).toBe(false);
    expect(findTariff("DE", "00000000")).toBeNull();
  });
});

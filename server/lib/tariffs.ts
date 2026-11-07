import aeRows from "../../data/tariff/AE.json" with { type: "json" };
import deRows from "../../data/tariff/DE.json" with { type: "json" };
import usRows from "../../data/tariff/US.json" with { type: "json" };
import type {
  CustomsDocument,
  DocumentLine,
  Jurisdiction,
  TariffRowData,
} from "../../shared/alora-types.js";

type RawTariffRow = Omit<TariffRowData, "jurisdiction">;

const BY_JURISDICTION: Record<Jurisdiction, RawTariffRow[]> = {
  DE: deRows as RawTariffRow[],
  US: usRows as RawTariffRow[],
  AE: aeRows as RawTariffRow[],
};

export const TARIFF_DATA: TariffRowData[] = (
  Object.keys(BY_JURISDICTION) as Jurisdiction[]
).flatMap((jurisdiction) =>
  BY_JURISDICTION[jurisdiction].map((row) => ({ ...row, jurisdiction })),
);

export const DISCLAIMER =
  "ESTIMATE — NOT LEGAL ADVICE. Rates are a frozen research snapshot, not a binding customs determination. Confirm the current tariff, origin rules and restrictions with the destination customs authority or a licensed broker before declaring.";

export function rowsFor(jurisdiction: string): TariffRowData[] {
  return TARIFF_DATA.filter((row) => row.jurisdiction === jurisdiction);
}

export function findTariff(
  jurisdiction: string,
  hsCode: string | null,
): TariffRowData | null {
  if (!hsCode) return null;
  return (
    TARIFF_DATA.find(
      (row) => row.jurisdiction === jurisdiction && row.hsCode === hsCode,
    ) ?? null
  );
}

/** Resolve precisely the cited version. Never substitute a newer rate. */
export function resolveCitedTariff(
  jurisdiction: string,
  line: Pick<
    DocumentLine,
    "hsCode" | "tariffSource" | "tariffVersion" | "tariffDatasetVersion"
  >,
): TariffRowData | null {
  const matches = TARIFF_DATA.filter(
    (row) =>
      row.jurisdiction === jurisdiction &&
      row.hsCode === line.hsCode &&
      row.source === line.tariffSource &&
      row.sourceVersion === line.tariffVersion &&
      (!line.tariffDatasetVersion ||
        row.datasetVersion === line.tariffDatasetVersion),
  );
  // Legacy documents without a dataset version are usable only if unambiguous.
  return matches.length === 1 ? matches[0]! : null;
}

export function tariffRequirements(
  document: CustomsDocument,
  jurisdiction = document.destination,
): {
  unconfirmedCodes: string[];
  unresolvedCodes: string[];
} {
  const unconfirmed = new Set<string>();
  const unresolved = new Set<string>();
  for (const line of document.lines) {
    const row = resolveCitedTariff(jurisdiction, line);
    if (!row) unresolved.add(line.hsCode);
    else if (row.nationalSuffixUnconfirmed) unconfirmed.add(row.hsCode);
  }
  return {
    unconfirmedCodes: [...unconfirmed].sort(),
    unresolvedCodes: [...unresolved].sort(),
  };
}

export function datasetVersionFor(jurisdiction: string): string {
  const rows = rowsFor(jurisdiction);
  return rows[0]?.datasetVersion ?? "unavailable";
}

export function tariffVersionVector(jurisdiction: string): string {
  return rowsFor(jurisdiction)
    .map((row) => `${row.hsCode}:${row.sourceVersion}:${row.datasetVersion}`)
    .sort()
    .join("|");
}

export type Jurisdiction = "DE" | "US" | "AE";
export type ClaimStatus =
  | "claimed"
  | "submitted"
  | "verified"
  | "human-approved";
export type CheckStatus = "pass" | "fail" | "warn";

export interface TariffRowData {
  jurisdiction: Jurisdiction;
  hsCode: string;
  description: string;
  dutyRate: number;
  vatRate: number | null;
  source: string;
  sourceVersion: string;
  sourceUrl: string;
  effectiveFrom: string;
  fetchedAt: string;
  datasetVersion: string;
  /** Granularity of the stored code exactly as the cited source publishes it. */
  codeLevel: string;
  /**
   * True when the stored row is a base-level code and the national suffix that
   * applies at declaration has not been confirmed against the destination
   * authority. Verification warns instead of implying full tariff-line accuracy.
   */
  nationalSuffixUnconfirmed: boolean;
  notes?: string;
}

export interface ShipmentLike {
  reference: string;
  destination: string;
  currency: string;
  incoterms: string;
  exporter: string;
  importer: string;
  shippingCost: number;
  insuranceCost: number;
}

export interface ItemLike {
  id: string;
  description: string;
  hsCode: string | null;
  hsConfidence: number | null;
  hsRationale: string | null;
  quantity: number;
  unitValue: number;
  weightKg: number;
  countryOfOrigin: string;
}

export interface DocumentLine {
  itemId: string;
  description: string;
  hsCode: string;
  quantity: number;
  unitValue: number;
  lineTotal: number;
  allocatedCharges: number;
  customsValue: number;
  dutyRate: number;
  vatRate: number;
  duty: number;
  vat: number;
  tariffSource: string;
  tariffVersion: string;
  tariffUrl: string;
  tariffCodeLevel?: string | undefined;
  tariffNationalSuffixUnconfirmed?: boolean | undefined;
  tariffDatasetVersion?: string | undefined;
  tariffMissing: boolean;
}

export interface CustomsDocument {
  document: "customs-package";
  schemaVersion: 1;
  shipmentRef: string;
  destination: string;
  currency: string;
  incoterms: string;
  exporter: string;
  importer: string;
  issuedAt: string;
  lines: DocumentLine[];
  totals: {
    goodsValue: number;
    shipping: number;
    insurance: number;
    customsValue: number;
    duty: number;
    vat: number;
    landedCost: number;
  };
  packingList: {
    totalPieces: number;
    totalWeightKg: number;
    lines: Array<{
      description: string;
      quantity: number;
      weightKg: number;
      countryOfOrigin: string;
    }>;
  };
  complianceChecklist: string[];
  tariffVector: Array<{
    hsCode: string;
    source: string;
    sourceVersion: string;
    sourceUrl: string;
    codeLevel?: string | undefined;
    nationalSuffixUnconfirmed?: boolean | undefined;
    datasetVersion?: string | undefined;
  }>;
  classification: {
    method: "deterministic-keyword-rules";
    confidence: number;
    requiresHumanConfirmation: boolean;
    rationale: string;
  };
  disclaimer: string;
}

export interface VerificationCheck {
  id: string;
  label: string;
  status: CheckStatus;
  expected?: string | number | null | undefined;
  actual?: string | number | null | undefined;
  detail: string;
}

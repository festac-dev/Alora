import type { CustomsDocument } from "../../shared/alora-types.js";
import { round2 } from "./document.js";

export interface AuditFinding {
  id: string;
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  remediation: string;
}

export function auditPackage(document: CustomsDocument): {
  findings: AuditFinding[];
  status: "issues" | "clean";
} {
  const findings: AuditFinding[] = [];
  const sum = (values: number[]) =>
    round2(values.reduce((total, value) => total + value, 0));

  const goods = sum(document.lines.map((line) => line.lineTotal));
  if (Math.abs(goods - document.totals.goodsValue) > 0.005) {
    findings.push({
      id: "goods-mismatch",
      severity: "high",
      title: "Declared goods value does not match the invoice lines",
      detail: `Lines sum to ${goods.toFixed(2)}, declared ${document.totals.goodsValue.toFixed(2)}.`,
      remediation: "Rebuild the package from the shipment and tariff snapshot.",
    });
  }

  const duty = sum(document.lines.map((line) => line.duty));
  if (Math.abs(duty - document.totals.duty) > 0.005) {
    findings.push({
      id: "duty-mismatch",
      severity: "high",
      title: "Duty total is unsupported by the line arithmetic",
      detail: `Lines sum to ${duty.toFixed(2)}, declared ${document.totals.duty.toFixed(2)}.`,
      remediation: "Recompute duty from the tariff row and customs value.",
    });
  }

  const vat = sum(document.lines.map((line) => line.vat));
  if (Math.abs(vat - document.totals.vat) > 0.005) {
    findings.push({
      id: "vat-mismatch",
      severity: "high",
      title: "VAT total is unsupported by the line arithmetic",
      detail: `Lines sum to ${vat.toFixed(2)}, declared ${document.totals.vat.toFixed(2)}. Difference ${Math.abs(vat - document.totals.vat).toFixed(2)}.`,
      remediation:
        "Recompute VAT as (customs value + duty) × tariff VAT rate and resubmit a new version.",
    });
  }

  const landed = round2(
    document.totals.customsValue +
      document.totals.duty +
      document.totals.vat,
  );
  if (Math.abs(landed - document.totals.landedCost) > 0.005) {
    findings.push({
      id: "landed-mismatch",
      severity: "high",
      title: "Landed cost does not reconcile",
      detail: `Declared ${document.totals.landedCost.toFixed(2)}, recomputed ${landed.toFixed(2)}.`,
      remediation: "Rebuild the landed cost breakdown.",
    });
  }

  for (const line of document.lines) {
    if (line.tariffMissing) {
      findings.push({
        id: `tariff-missing:${line.itemId}`,
        severity: "high",
        title: `No tariff row for ${line.hsCode}`,
        detail: `"${line.description}" cannot be released without a classified tariff row.`,
        remediation: "Assign a valid HS code and rerun the Builder.",
      });
    }
  }

  if (document.classification.confidence < 0.85) {
    findings.push({
      id: "low-confidence",
      severity: "medium",
      title: "HS classification has low confidence",
      detail: `Confidence ${(document.classification.confidence * 100).toFixed(0)}%. ${document.classification.rationale}`,
      remediation:
        "Require human confirmation of the classification before release.",
    });
  }

  if (!document.disclaimer.includes("NOT LEGAL ADVICE")) {
    findings.push({
      id: "missing-disclaimer",
      severity: "medium",
      title: "Estimate disclaimer missing",
      detail: "Commercial outputs must be labelled as estimates, not legal advice.",
      remediation: "Reissue the document with the disclaimer attached.",
    });
  }

  if (document.complianceChecklist.length < 5) {
    findings.push({
      id: "thin-checklist",
      severity: "low",
      title: "Compliance checklist is incomplete",
      detail: "Fewer than five destination checks were recorded.",
      remediation: "Add the destination-specific checklist items.",
    });
  }

  return {
    findings,
    status: findings.some((finding) => finding.severity === "high")
      ? "issues"
      : "clean",
  };
}

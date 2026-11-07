import type {
  CustomsDocument,
  TariffRowData,
  VerificationCheck,
} from "@shared/alora-types";
import type {
  EvidenceSnapshot,
  EvidenceResult,
} from "@shared/evidence-snapshot";

export interface ShipmentSummary {
  id: string;
  reference: string;
  destination: string;
  status: string;
  source: string;
  forkedFrom: string | null;
  createdAt: string;
  itemCount: number;
  units: number;
  claimStatus: string;
  verification: string;
  risk: string;
}

export interface Shipment {
  id: string;
  reference: string;
  origin: string;
  destination: string;
  status: string;
  currency: string;
  incoterms: string;
  exporter: string;
  importer: string;
  shippingCost: number;
  insuranceCost: number;
  source: string;
  forkedFrom: string | null;
  notes: string | null;
  stateHash: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Item {
  id: string;
  shipmentId: string;
  description: string;
  hsCode: string | null;
  hsConfidence: number | null;
  hsRationale: string | null;
  quantity: number;
  unitValue: number;
  currency: string;
  weightKg: number;
  countryOfOrigin: string;
}

export interface Claim {
  id: string;
  shipmentId: string;
  deliverableId: string | null;
  verificationRunId: string | null;
  agentId: string | null;
  type: string;
  status: string;
  inputsHash: string | null;
  tariffVersion: string | null;
  confidence: number | null;
  rationale: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeliverableSummary {
  id: string;
  shipmentId: string;
  claimId: string | null;
  kind: string;
  filename: string;
  sha256: string;
  mime: string;
  version: number;
  state: string;
  createdAt: string;
  byteLength: number;
  hashMatches: boolean;
}

export interface ActiveDeliverable extends DeliverableSummary {
  bytes: string;
}

export interface Approval {
  id: string;
  deliverableId: string;
  shipmentId: string;
  approverId: string;
  approverKind: string;
  approvedSha256: string;
  verificationRunId: string | null;
  tariffBaseLevelAcknowledged: boolean;
  tariffBaseLevelCodes: string | null;
  revoked: boolean;
  revokedReason: string | null;
  createdAt: string;
  revokedAt: string | null;
}

export interface VerificationRun {
  id: string;
  shipmentId: string;
  deliverableId: string | null;
  status: string;
  checks: VerificationCheck[];
  evidenceHash: string | null;
  verifiedSha256: string | null;
  inputsHash: string | null;
  policyVersion: number;
  createdAt: string;
}

export interface EvidenceEntry {
  id: string;
  shipmentId: string;
  claimId: string | null;
  kind: string;
  summary: string;
  detail: unknown;
  createdAt: string;
}

export interface Mission {
  id: string;
  shipmentId: string;
  outcome: string;
  acceptanceCriteria: string;
  budget: number | null;
  deadline: string | null;
  status: string;
  createdAt: string;
}

export interface Task {
  id: string;
  missionId: string;
  title: string;
  assigneeAgentId: string | null;
  status: string;
  dependsOn: string | null;
  createdAt: string;
}

export interface LedgerEntry {
  id: number;
  shipmentId: string;
  prevHash: string;
  entryHash: string;
  payload: string;
  caller: string;
  actionName: string;
  actor: string;
  inverseAction: string;
  createdAt: string;
}

export interface CourierDraft {
  id: string;
  shipmentId: string;
  courier: string;
  subject: string;
  body: string;
  sha256: string;
  status: string;
  approvedBy: string | null;
  approvedSha256: string | null;
  sentAt: string | null;
  createdAt: string;
}

export interface ProposedAction {
  id: string;
  shipmentId: string | null;
  name: string;
  description: string;
  reason: string;
  code: string;
  schemaJson: string;
  status: string;
  runtimeLoad: boolean;
  approvedBy: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewedCodeSha256: string | null;
  createdAt: string;
}

export interface Tariff extends TariffRowData {
  id: string;
}

export interface AloraBundle {
  snapshot: EvidenceSnapshot;
  tariffRequirements: {
    unconfirmedCodes: string[];
    unresolvedCodes: string[];
    resolved: boolean;
  };
  shipment: Shipment;
  items: Item[];
  claim: Claim | null;
  deliverables: DeliverableSummary[];
  activeDeliverable: ActiveDeliverable | null;
  document: CustomsDocument | null;
  approvals: Approval[];
  activeApproval: Approval | null;
  approvalHistory: Approval | null;
  verificationRuns: VerificationRun[];
  lastVerification: VerificationRun | null;
  evidence: EvidenceEntry[];
  mission: Mission | null;
  tasks: Task[];
  ledger: LedgerEntry[];
  chain: {
    valid: boolean;
    brokenAt: number | null;
    entries: number;
    globalEntries?: number;
    tipHash: string;
  };
  courierDrafts: CourierDraft[];
  proposedActions: ProposedAction[];
  tariffs: Tariff[];
  risk: string;
  integrity: {
    hashMatches: boolean;
    hasDeliverable: boolean;
    verificationCurrent: boolean;
    approvalHashMatches: boolean | null;
    approvalRevoked: boolean;
  };
}

export interface AgentTrust {
  id: string;
  kind: string;
  role: string;
  country: string | null;
  displayName: string;
  createdAt: string;
  totalClaims: number;
  verifiedClaims: number;
  rejectedRuns: number;
  approvalsGranted: number;
  ledgerEntries: number;
  chainValid: boolean;
  trustScore: number;
}

export type VerificationResult = EvidenceResult;

export interface DemoResult {
  script: string;
  clickPath: Array<{
    action: string;
    params: Record<string, unknown>;
    expect: string;
  }>;
  ledgerIds: number[];
}

export interface SelfHealResult {
  confidence: number;
  patches: Array<{
    field: string;
    problem: string;
    expected?: unknown;
    actual?: unknown;
    patch: string;
  }>;
  requiresApproval: boolean;
  note: string;
  applied: {
    deliverableId: string;
    sha256: string;
    version: number;
    previousApprovalsRevoked: number;
  } | null;
}

export interface SurgeResult {
  workers: number;
  totalLines: number;
  passed: number;
  failed: number;
  durationMs: number;
  costUsd: number;
  partitions: Array<{ worker: number; lines: number; status: string }>;
}

export interface IntakeResult {
  draft: {
    items: Array<{
      description: string;
      quantity: number;
      unitValue: number;
      hsCode: string | null;
      hsConfidence: number;
      hsRationale: string;
    }>;
    unparsedLines: string[];
  };
  shipmentId: string | null;
  reference: string | null;
  message: string;
}

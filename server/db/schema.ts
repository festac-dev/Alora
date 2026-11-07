import { sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  integer,
  pgTable,
  text,
} from "drizzle-orm/pg-core";

export const shipments = pgTable("shipments", {
  id: text("id").primaryKey(),
  reference: text("reference").notNull(),
  origin: text("origin").notNull().default("DE"),
  destination: text("destination").notNull(),
  status: text("status").notNull().default("draft"),
  currency: text("currency").notNull().default("EUR"),
  incoterms: text("incoterms").notNull().default("DAP"),
  exporter: text("exporter").notNull().default("Alora Trading GmbH"),
  importer: text("importer").notNull().default("Northline Imports LLC"),
  shippingCost: doublePrecision("shipping_cost").notNull().default(0),
  insuranceCost: doublePrecision("insurance_cost").notNull().default(0),
  source: text("source").notNull().default("ui"),
  forkedFrom: text("forked_from"),
  notes: text("notes"),
  stateHash: text("state_hash"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`now()`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`now()`),
});

export const items = pgTable("items", {
  id: text("id").primaryKey(),
  shipmentId: text("shipment_id").notNull(),
  description: text("description").notNull(),
  hsCode: text("hs_code"),
  hsConfidence: doublePrecision("hs_confidence"),
  hsRationale: text("hs_rationale"),
  quantity: integer("quantity").notNull(),
  unitValue: doublePrecision("unit_value").notNull(),
  currency: text("currency").notNull().default("EUR"),
  weightKg: doublePrecision("weight_kg").notNull().default(0),
  countryOfOrigin: text("country_of_origin").notNull().default("DE"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`now()`),
});

export const tariffRows = pgTable("tariff_rows", {
  id: text("id").primaryKey(),
  jurisdiction: text("jurisdiction").notNull(),
  hsCode: text("hs_code").notNull(),
  description: text("description").notNull(),
  dutyRate: doublePrecision("duty_rate").notNull(),
  vatRate: doublePrecision("vat_rate"),
  source: text("source").notNull(),
  sourceVersion: text("source_version").notNull(),
  sourceUrl: text("source_url").notNull(),
  effectiveFrom: text("effective_from").notNull(),
  fetchedAt: text("fetched_at").notNull(),
  datasetVersion: text("dataset_version").notNull(),
  codeLevel: text("code_level").notNull().default("unspecified"),
  nationalSuffixUnconfirmed: boolean("national_suffix_unconfirmed")
    .notNull()
    .default(false),
  notes: text("notes"),
});

export const agents = pgTable("agents", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull().default("agent"),
  role: text("role").notNull(),
  country: text("country"),
  displayName: text("display_name").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`now()`),
});

export const missions = pgTable("missions", {
  id: text("id").primaryKey(),
  shipmentId: text("shipment_id").notNull(),
  outcome: text("outcome").notNull(),
  acceptanceCriteria: text("acceptance_criteria").notNull(),
  budget: doublePrecision("budget"),
  deadline: text("deadline"),
  status: text("status").notNull().default("planned"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`now()`),
});

export const tasks = pgTable("tasks", {
  id: text("id").primaryKey(),
  missionId: text("mission_id").notNull(),
  title: text("title").notNull(),
  assigneeAgentId: text("assignee_agent_id"),
  status: text("status").notNull().default("pending"),
  dependsOn: text("depends_on"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`now()`),
});

export const claims = pgTable("claims", {
  id: text("id").primaryKey(),
  shipmentId: text("shipment_id").notNull(),
  deliverableId: text("deliverable_id"),
  verificationRunId: text("verification_run_id"),
  agentId: text("agent_id"),
  type: text("type").notNull().default("customs-package"),
  status: text("status").notNull().default("claimed"),
  inputsHash: text("inputs_hash"),
  tariffVersion: text("tariff_version"),
  confidence: doublePrecision("confidence"),
  rationale: text("rationale"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`now()`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`now()`),
});

export const deliverables = pgTable("deliverables", {
  id: text("id").primaryKey(),
  shipmentId: text("shipment_id").notNull(),
  claimId: text("claim_id"),
  kind: text("kind").notNull().default("customs-package"),
  filename: text("filename").notNull(),
  bytes: text("bytes").notNull(),
  sha256: text("sha256").notNull(),
  mime: text("mime").notNull().default("application/json"),
  version: integer("version").notNull().default(1),
  state: text("state").notNull().default("active"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`now()`),
});

export const approvals = pgTable("approvals", {
  id: text("id").primaryKey(),
  deliverableId: text("deliverable_id").notNull(),
  shipmentId: text("shipment_id").notNull(),
  approverId: text("approver_id").notNull(),
  approverKind: text("approver_kind").notNull().default("human"),
  approvedSha256: text("approved_sha256").notNull(),
  verificationRunId: text("verification_run_id"),
  tariffBaseLevelAcknowledged: boolean("tariff_base_level_acknowledged")
    .notNull()
    .default(false),
  tariffBaseLevelCodes: text("tariff_base_level_codes"),
  revoked: boolean("revoked").notNull().default(false),
  revokedReason: text("revoked_reason"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`now()`),
  revokedAt: text("revoked_at"),
});

export const verificationRuns = pgTable("verification_runs", {
  id: text("id").primaryKey(),
  shipmentId: text("shipment_id").notNull(),
  deliverableId: text("deliverable_id"),
  status: text("status").notNull(),
  checks: text("checks").notNull(),
  evidenceHash: text("evidence_hash"),
  verifiedSha256: text("verified_sha256"),
  inputsHash: text("inputs_hash"),
  policyVersion: integer("policy_version").notNull().default(1),
  createdAt: text("created_at")
    .notNull()
    .default(sql`now()`),
});

export const evidence = pgTable("evidence", {
  id: text("id").primaryKey(),
  shipmentId: text("shipment_id").notNull(),
  claimId: text("claim_id"),
  kind: text("kind").notNull(),
  summary: text("summary").notNull(),
  detail: text("detail"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`now()`),
});

export const ledger = pgTable("ledger", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  shipmentId: text("shipment_id").notNull(),
  prevHash: text("prev_hash").notNull(),
  entryHash: text("entry_hash").notNull(),
  payload: text("payload").notNull(),
  caller: text("caller").notNull(),
  actionName: text("action_name").notNull(),
  actor: text("actor").notNull().default("operator"),
  inverseAction: text("inverse_action").notNull(),
  createdAt: text("created_at").notNull(),
});

export const ledgerHead = pgTable("alora_ledger_head", {
  id: text("id").primaryKey(),
  tipId: integer("tip_id").notNull().default(0),
  tipHash: text("tip_hash").notNull().default("GENESIS"),
});

export const proposedActions = pgTable("proposed_actions", {
  id: text("id").primaryKey(),
  shipmentId: text("shipment_id"),
  name: text("name").notNull(),
  description: text("description").notNull(),
  reason: text("reason").notNull(),
  code: text("code").notNull(),
  schemaJson: text("schema_json").notNull(),
  status: text("status").notNull().default("pending"),
  runtimeLoad: boolean("runtime_load").notNull().default(false),
  approvedBy: text("approved_by"),
  reviewedBy: text("reviewed_by"),
  reviewedAt: text("reviewed_at"),
  reviewedCodeSha256: text("reviewed_code_sha256"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`now()`),
});

export const courierDrafts = pgTable("courier_drafts", {
  id: text("id").primaryKey(),
  shipmentId: text("shipment_id").notNull(),
  courier: text("courier").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  sha256: text("sha256").notNull(),
  status: text("status").notNull().default("draft"),
  approvedBy: text("approved_by"),
  approvedSha256: text("approved_sha256"),
  sentAt: text("sent_at"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`now()`),
});

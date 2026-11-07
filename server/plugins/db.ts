import { runMigrations, type MigrationEntry } from "@agent-native/core/db";

export const aloraMigrations: MigrationEntry[] = [
  {
    version: 1,
    name: "alora-core-schema",
    sql: `
        CREATE TABLE IF NOT EXISTS shipments (
          id TEXT PRIMARY KEY,
          reference TEXT NOT NULL,
          origin TEXT NOT NULL DEFAULT 'DE',
          destination TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'draft',
          currency TEXT NOT NULL DEFAULT 'EUR',
          incoterms TEXT NOT NULL DEFAULT 'DAP',
          exporter TEXT NOT NULL DEFAULT 'Alora Trading GmbH',
          importer TEXT NOT NULL DEFAULT 'Northline Imports LLC',
          shipping_cost DOUBLE PRECISION NOT NULL DEFAULT 0,
          insurance_cost DOUBLE PRECISION NOT NULL DEFAULT 0,
          source TEXT NOT NULL DEFAULT 'ui',
          forked_from TEXT,
          notes TEXT,
          state_hash TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS items (
          id TEXT PRIMARY KEY,
          shipment_id TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
          description TEXT NOT NULL,
          hs_code TEXT,
          hs_confidence DOUBLE PRECISION,
          hs_rationale TEXT,
          quantity INTEGER NOT NULL,
          unit_value DOUBLE PRECISION NOT NULL,
          currency TEXT NOT NULL DEFAULT 'EUR',
          weight_kg DOUBLE PRECISION NOT NULL DEFAULT 0,
          country_of_origin TEXT NOT NULL DEFAULT 'DE',
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS items_shipment_idx ON items(shipment_id);

        CREATE TABLE IF NOT EXISTS tariff_rows (
          id TEXT PRIMARY KEY,
          jurisdiction TEXT NOT NULL,
          hs_code TEXT NOT NULL,
          description TEXT NOT NULL,
          duty_rate DOUBLE PRECISION NOT NULL,
          vat_rate DOUBLE PRECISION,
          source TEXT NOT NULL,
          source_version TEXT NOT NULL,
          source_url TEXT NOT NULL,
          effective_from TEXT NOT NULL,
          fetched_at TEXT NOT NULL,
          dataset_version TEXT NOT NULL,
          notes TEXT
        );
        CREATE UNIQUE INDEX IF NOT EXISTS tariff_jurisdiction_code_idx
          ON tariff_rows(jurisdiction, hs_code);

        CREATE TABLE IF NOT EXISTS agents (
          id TEXT PRIMARY KEY,
          kind TEXT NOT NULL DEFAULT 'agent',
          role TEXT NOT NULL,
          country TEXT,
          display_name TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS missions (
          id TEXT PRIMARY KEY,
          shipment_id TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
          outcome TEXT NOT NULL,
          acceptance_criteria TEXT NOT NULL,
          budget DOUBLE PRECISION,
          deadline TEXT,
          status TEXT NOT NULL DEFAULT 'planned',
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS missions_shipment_idx ON missions(shipment_id);

        CREATE TABLE IF NOT EXISTS tasks (
          id TEXT PRIMARY KEY,
          mission_id TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          assignee_agent_id TEXT,
          status TEXT NOT NULL DEFAULT 'pending',
          depends_on TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS tasks_mission_idx ON tasks(mission_id);

        CREATE TABLE IF NOT EXISTS claims (
          id TEXT PRIMARY KEY,
          shipment_id TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
          deliverable_id TEXT,
          agent_id TEXT,
          type TEXT NOT NULL DEFAULT 'customs-package',
          status TEXT NOT NULL DEFAULT 'claimed',
          inputs_hash TEXT,
          tariff_version TEXT,
          confidence DOUBLE PRECISION,
          rationale TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS claims_shipment_idx ON claims(shipment_id);

        CREATE TABLE IF NOT EXISTS deliverables (
          id TEXT PRIMARY KEY,
          shipment_id TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
          claim_id TEXT,
          kind TEXT NOT NULL DEFAULT 'customs-package',
          filename TEXT NOT NULL,
          bytes TEXT NOT NULL,
          sha256 TEXT NOT NULL,
          mime TEXT NOT NULL DEFAULT 'application/json',
          version INTEGER NOT NULL DEFAULT 1,
          state TEXT NOT NULL DEFAULT 'active',
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS deliverables_shipment_idx ON deliverables(shipment_id);

        CREATE TABLE IF NOT EXISTS approvals (
          id TEXT PRIMARY KEY,
          deliverable_id TEXT NOT NULL REFERENCES deliverables(id) ON DELETE CASCADE,
          shipment_id TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
          approver_id TEXT NOT NULL,
          approver_kind TEXT NOT NULL DEFAULT 'human',
          approved_sha256 TEXT NOT NULL,
          verification_run_id TEXT,
          revoked BOOLEAN NOT NULL DEFAULT FALSE,
          revoked_reason TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          revoked_at TIMESTAMPTZ
        );
        CREATE INDEX IF NOT EXISTS approvals_deliverable_idx ON approvals(deliverable_id);

        CREATE TABLE IF NOT EXISTS verification_runs (
          id TEXT PRIMARY KEY,
          shipment_id TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
          deliverable_id TEXT,
          status TEXT NOT NULL,
          checks TEXT NOT NULL,
          evidence_hash TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS verification_shipment_idx ON verification_runs(shipment_id);

        CREATE TABLE IF NOT EXISTS evidence (
          id TEXT PRIMARY KEY,
          shipment_id TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
          claim_id TEXT,
          kind TEXT NOT NULL,
          summary TEXT NOT NULL,
          detail TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS evidence_shipment_idx ON evidence(shipment_id);

        CREATE TABLE IF NOT EXISTS ledger (
          id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
          shipment_id TEXT NOT NULL,
          prev_hash TEXT NOT NULL,
          entry_hash TEXT NOT NULL,
          payload TEXT NOT NULL,
          caller TEXT NOT NULL,
          action_name TEXT NOT NULL,
          actor TEXT NOT NULL DEFAULT 'operator',
          inverse_action TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL
        );
        CREATE INDEX IF NOT EXISTS ledger_shipment_idx ON ledger(shipment_id);

        CREATE TABLE IF NOT EXISTS proposed_actions (
          id TEXT PRIMARY KEY,
          shipment_id TEXT,
          name TEXT NOT NULL,
          description TEXT NOT NULL,
          reason TEXT NOT NULL,
          code TEXT NOT NULL,
          schema_json TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          runtime_load BOOLEAN NOT NULL DEFAULT FALSE,
          approved_by TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS courier_drafts (
          id TEXT PRIMARY KEY,
          shipment_id TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
          courier TEXT NOT NULL,
          subject TEXT NOT NULL,
          body TEXT NOT NULL,
          sha256 TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'draft',
          approved_by TEXT,
          approved_sha256 TEXT,
          sent_at TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS courier_shipment_idx ON courier_drafts(shipment_id);
      `,
  },
  {
    version: 2,
    name: "tariff-code-level-and-template-review",
    sql: `
        ALTER TABLE tariff_rows
          ADD COLUMN IF NOT EXISTS code_level TEXT NOT NULL DEFAULT 'unspecified',
          ADD COLUMN IF NOT EXISTS national_suffix_unconfirmed BOOLEAN NOT NULL DEFAULT FALSE;

        ALTER TABLE proposed_actions
          ADD COLUMN IF NOT EXISTS reviewed_by TEXT,
          ADD COLUMN IF NOT EXISTS reviewed_at TEXT,
          ADD COLUMN IF NOT EXISTS reviewed_code_sha256 TEXT;
      `,
  },
  {
    version: 3,
    name: "tariff-code-level-backfill",
    // Rows installed before migration 2 keep the column default. Backfill the
    // bundled snapshot's levels so an in-place upgrade never reports an AE row
    // as fully confirmed. installTariffSnapshot stays the ongoing writer; this
    // is a point-in-time copy of data/tariff/*.json.
    sql: `
        UPDATE tariff_rows
          SET code_level = 'GCC/HS 8-digit base',
              national_suffix_unconfirmed = TRUE
          WHERE jurisdiction = 'AE' AND code_level = 'unspecified';

        UPDATE tariff_rows
          SET code_level = 'EU CN 8-digit'
          WHERE jurisdiction = 'DE' AND code_level = 'unspecified';

        UPDATE tariff_rows
          SET code_level = 'HTS 8-digit subheading'
          WHERE jurisdiction = 'US' AND code_level = 'unspecified';
      `,
  },
  {
    version: 4,
    name: "approval-base-level-acknowledgement",
    sql: `
        ALTER TABLE approvals
          ADD COLUMN IF NOT EXISTS tariff_base_level_acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
          ADD COLUMN IF NOT EXISTS tariff_base_level_codes TEXT;
      `,
  },
  {
    version: 5,
    name: "atomic-ledger-and-verification-bindings",
    run: async (exec) => {
      const { rows } = await exec.execute(`
          SELECT 'duplicate deliverable versions' AS issue FROM deliverables GROUP BY shipment_id, version HAVING COUNT(*) > 1
          UNION ALL
          SELECT 'multiple active deliverables' AS issue FROM deliverables WHERE state = 'active' GROUP BY shipment_id HAVING COUNT(*) > 1
          UNION ALL
          SELECT 'multiple active approvals' AS issue FROM approvals WHERE revoked = FALSE GROUP BY deliverable_id HAVING COUNT(*) > 1
        `);
      if (rows.length)
        throw new Error(
          `Reconcile ${[...new Set(rows.map((row) => row.issue))].join(", ")} before retrying migration 5. Historical records have not been changed.`,
        );
    },
    sql: `
        CREATE TABLE IF NOT EXISTS alora_ledger_head (
          id TEXT PRIMARY KEY CHECK (id = 'global'),
          tip_id INTEGER NOT NULL DEFAULT 0,
          tip_hash TEXT NOT NULL DEFAULT 'GENESIS'
        );
        INSERT INTO alora_ledger_head (id, tip_id, tip_hash)
          VALUES ('global',
            COALESCE((SELECT id FROM ledger ORDER BY id DESC LIMIT 1), 0),
            COALESCE((SELECT entry_hash FROM ledger ORDER BY id DESC LIMIT 1), 'GENESIS'))
          ON CONFLICT (id) DO NOTHING;

        ALTER TABLE claims ADD COLUMN IF NOT EXISTS verification_run_id TEXT;
        ALTER TABLE verification_runs
          ADD COLUMN IF NOT EXISTS verified_sha256 TEXT,
          ADD COLUMN IF NOT EXISTS inputs_hash TEXT,
          ADD COLUMN IF NOT EXISTS policy_version INTEGER NOT NULL DEFAULT 1;

        CREATE UNIQUE INDEX IF NOT EXISTS deliverables_shipment_version_unique
          ON deliverables(shipment_id, version);
        CREATE UNIQUE INDEX IF NOT EXISTS deliverables_one_active_per_shipment
          ON deliverables(shipment_id) WHERE state = 'active';
        CREATE UNIQUE INDEX IF NOT EXISTS approvals_one_active_per_deliverable
          ON approvals(deliverable_id) WHERE revoked = FALSE;
      `,
  },
];

export default runMigrations(aloraMigrations, { table: "alora_migrations" });

import {
  closeDbExec,
  getDbExec,
  runMigrations,
  withMigrationRuntime,
} from "@agent-native/core/db";
import { afterAll, describe, expect, it } from "vitest";

import { aloraMigrations } from "../plugins/db.js";
import { canonicalJSON, sha256 } from "./hash.js";

afterAll(async () => {
  await closeDbExec();
});

describe("upgrade from existing Alora evidence", () => {
  it("preserves old records, seeds the real tip, and refuses ambiguous active state without rewriting history", async () => {
    await withMigrationRuntime(async () => {
      await runMigrations(
        aloraMigrations.filter((entry) => entry.version < 5),
        { table: "alora_migrations" },
      )(null);
      const db = getDbExec();
      await db.execute(
        "INSERT INTO shipments (id, reference, destination) VALUES ('legacy-shipment', 'LEGACY', 'AE')",
      );
      await db.execute(
        "INSERT INTO deliverables (id, shipment_id, filename, bytes, sha256, version) VALUES ('legacy-document', 'legacy-shipment', 'legacy.json', 'untouched legacy bytes', 'old-digest', 1)",
      );
      await db.execute(
        "INSERT INTO deliverables (id, shipment_id, filename, bytes, sha256, version) VALUES ('duplicate-active', 'legacy-shipment', 'v2.json', 'second bytes', 'second-digest', 2)",
      );
      await db.execute(
        "INSERT INTO claims (id, shipment_id, deliverable_id, status) VALUES ('legacy-claim', 'legacy-shipment', 'legacy-document', 'human-approved')",
      );
      await db.execute(
        "INSERT INTO verification_runs (id, shipment_id, deliverable_id, status, checks, evidence_hash) VALUES ('legacy-run', 'legacy-shipment', 'legacy-document', 'verified', '[]', 'legacy-proof')",
      );
      await db.execute(
        "INSERT INTO approvals (id, deliverable_id, shipment_id, approver_id, approved_sha256, verification_run_id) VALUES ('legacy-approval', 'legacy-document', 'legacy-shipment', 'human@example.com', 'old-digest', 'legacy-run')",
      );
      const payload = canonicalJSON({
        shipmentId: "legacy-shipment",
        actionName: "createShipment",
        caller: "ui",
        actor: "human@example.com",
        inverseAction: "archiveShipment",
        createdAt: "2026-01-01T00:00:00.000Z",
        data: {},
      });
      const tip = sha256("GENESIS" + payload);
      await db.execute({
        sql: "INSERT INTO ledger (shipment_id, prev_hash, entry_hash, payload, caller, action_name, actor, inverse_action, created_at) VALUES ($1, 'GENESIS', $2, $3, 'ui', 'createShipment', 'human@example.com', 'archiveShipment', '2026-01-01T00:00:00.000Z')",
        args: ["legacy-shipment", tip, payload],
      });
      const upgrade = runMigrations(aloraMigrations, {
        table: "alora_migrations",
      });
      await expect(upgrade(null)).rejects.toThrow(
        "multiple active deliverables",
      );
      expect(
        (
          await db.execute(
            "SELECT bytes FROM deliverables WHERE id = 'legacy-document'",
          )
        ).rows[0]?.bytes,
      ).toBe("untouched legacy bytes");
      expect(
        (
          await db.execute(
            "SELECT to_regclass('alora_ledger_head') AS table_name",
          )
        ).rows[0]?.table_name,
      ).toBeNull();
      await db.execute(
        "UPDATE deliverables SET state = 'superseded' WHERE id = 'duplicate-active'",
      );
      await upgrade(null);
      await upgrade(null);
      expect(
        (await db.execute("SELECT * FROM alora_ledger_head")).rows[0],
      ).toMatchObject({ id: "global", tip_hash: tip, tip_id: 1 });
      expect(
        (await db.execute("SELECT * FROM verification_runs")).rows[0],
      ).toMatchObject({
        policy_version: 1,
        verified_sha256: null,
        inputs_hash: null,
        evidence_hash: "legacy-proof",
        checks: "[]",
      });
      expect(
        (await db.execute("SELECT * FROM claims")).rows[0]?.verification_run_id,
      ).toBeNull();
      expect(
        (await db.execute("SELECT * FROM approvals")).rows[0],
      ).toMatchObject({
        revoked: false,
        tariff_base_level_acknowledged: false,
        verification_run_id: "legacy-run",
      });
      expect(
        (await db.execute("SELECT payload, entry_hash FROM ledger")).rows[0],
      ).toEqual({ payload, entry_hash: tip });
      expect(
        (await db.execute("SELECT * FROM deliverables")).rows,
      ).toHaveLength(2);
    });
  }, 60_000);
});

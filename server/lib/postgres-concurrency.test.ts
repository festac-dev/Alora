import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  closeDbExec,
  getDatabaseUrl,
  withMigrationRuntime,
} from "@agent-native/core/db";
import { beforeAll, afterAll, describe, expect, it } from "vitest";

import { getDb } from "../db/index.js";
import { approvals, deliverables, ledgerHead } from "../db/schema.js";
import migrate from "../plugins/db.js";
import {
  createShipment,
  resetWorkspace,
  runBuilder,
  runVerifier,
} from "./commands.js";
import { checkChain, ledgerEntries } from "./ledger.js";
import { getShipmentBundle } from "./queries.js";

// guard:allow-env-credential — Test-only localhost alora_test_* database; validated before any migration or write.
const postgresUrl = process.env.ALORA_TEST_POSTGRES_URL;
const actor = {
  caller: "cli" as const,
  actor: "concurrency-test@example.com",
  authenticatedApprover: "concurrency-test@example.com",
};
const workerPath = fileURLToPath(
  new URL("../../scripts/test-postgres-worker.ts", import.meta.url),
);
const exec = promisify(execFile);

describe.skipIf(!postgresUrl)(
  "PostgreSQL concurrency across independent processes",
  () => {
    beforeAll(async () => {
      const url = new URL(postgresUrl!);
      if (
        !["localhost", "127.0.0.1"].includes(url.hostname) ||
        !url.pathname.startsWith("/alora_test_")
      )
        throw new Error("Use a disposable localhost alora_test_* database");
      process.env.DATABASE_URL = postgresUrl!;
      if (getDatabaseUrl() !== postgresUrl)
        throw new Error(
          "Another deployment setting overrides the isolated test database",
        );
      await withMigrationRuntime(async () => {
        await migrate(null);
      });
      await resetWorkspace();
    }, 60_000);
    afterAll(async () => {
      await closeDbExec();
    });
    async function worker(...args: string[]) {
      const { stdout } = await exec(
        process.execPath,
        ["--import", "tsx", workerPath, ...args],
        {
          env: { ...process.env, DATABASE_URL: postgresUrl! },
          timeout: 60_000,
        },
      );
      return JSON.parse(stdout.trim().split("\n").pop()!) as Record<
        string,
        unknown
      >;
    }

    it("creates one linear ledger and unique versions when both processes write concurrently", async () => {
      await Promise.all([worker("create"), worker("create")]);
      const created = await createShipment(
        {
          destination: "DE",
          currency: "EUR",
          items: [
            {
              description: "Cotton T-shirts",
              hsCode: "61091000",
              quantity: 10,
              unitValue: 20,
            },
          ],
        },
        actor,
      );
      const built = await Promise.all([
        worker("build", created.id),
        worker("build", created.id),
      ]);
      expect(built.map((row) => row.version).sort()).toEqual([1, 2]);
      const rows = await ledgerEntries();
      expect(checkChain(rows).valid).toBe(true);
      const documents = await getDb().select().from(deliverables);
      expect(
        documents.filter(
          (row) => row.shipmentId === created.id && row.state === "active",
        ),
      ).toHaveLength(1);
      expect((await getDb().select().from(ledgerHead))[0]).toMatchObject({
        tipId: rows[rows.length - 1]!.id,
        tipHash: rows[rows.length - 1]!.entryHash,
      });
    }, 90_000);

    it("deduplicates simultaneous approvals and safely serializes approval against tampering", async () => {
      const created = await createShipment(
        {
          destination: "DE",
          currency: "EUR",
          items: [
            {
              description: "Cotton T-shirts",
              hsCode: "61091000",
              quantity: 10,
              unitValue: 20,
            },
          ],
        },
        actor,
      );
      const built = await runBuilder(created.id, actor);
      await runVerifier(created.id, actor);
      const granted = await Promise.all([
        worker("approve", created.id, built.deliverableId),
        worker("approve", created.id, built.deliverableId),
      ]);
      expect(granted[0]?.approvalId).toBeTruthy();
      expect(granted[0]?.approvalId).toBe(granted[1]?.approvalId);
      await Promise.all([
        worker("approve", created.id, built.deliverableId),
        worker("tamper", created.id),
      ]);
      const stored = (await getDb().select().from(approvals)).filter(
        (row) => row.shipmentId === created.id,
      );
      expect(stored).toHaveLength(1);
      expect(stored[0]?.revoked).toBe(true);
      expect((await getShipmentBundle(created.id))?.activeApproval).toBeNull();
      expect(checkChain(await ledgerEntries()).valid).toBe(true);
    }, 90_000);
  },
);

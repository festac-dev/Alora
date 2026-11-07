import { AsyncLocalStorage } from "node:async_hooks";

import { eq } from "drizzle-orm";

import { getDb } from "../db/index.js";
import { ledgerHead } from "../db/schema.js";

// Core scopes getDb() to its Drizzle transaction on PostgreSQL and PGlite.
// This context only owns domain nesting: composite commands reuse that boundary.
const domainTransaction = new AsyncLocalStorage<"read" | "write">();

/** A policy refusal whose compensating revocation must commit before reporting failure. */
export class RevocationRefusal extends Error {}

export async function withMutation<T>(run: () => Promise<T>): Promise<T> {
  const active = domainTransaction.getStore();
  if (active === "write") return run();
  if (active === "read")
    throw new Error("A read snapshot cannot perform a mutation");
  const outcome = await getDb().transaction(async (tx) => {
    // All domain writers acquire this lock first. It protects the chain across
    // processes and keeps approval checks in the same transaction as their writes.
    const rows = await tx
      .select()
      .from(ledgerHead)
      .where(eq(ledgerHead.id, "global"))
      .for("update");
    if (!rows[0])
      throw new Error("Ledger head is missing. Apply the Alora migrations.");
    return domainTransaction.run("write", async () => {
      try {
        return { value: await run() } as const;
      } catch (error) {
        if (error instanceof RevocationRefusal)
          return { refusal: error } as const;
        throw error;
      }
    });
  });
  if ("refusal" in outcome) throw outcome.refusal;
  return outcome.value;
}

export function atomicMutation<Args extends unknown[], Result>(
  run: (...args: Args) => Promise<Result>,
) {
  return (...args: Args): Promise<Result> => withMutation(() => run(...args));
}

export async function withSnapshot<T>(run: () => Promise<T>): Promise<T> {
  if (domainTransaction.getStore()) return run();
  return getDb().transaction(() => domainTransaction.run("read", run), {
    isolationLevel: "repeatable read",
    accessMode: "read only",
  });
}

export function snapshotQuery<Args extends unknown[], Result>(
  run: (...args: Args) => Promise<Result>,
) {
  return (...args: Args): Promise<Result> => withSnapshot(() => run(...args));
}

import type { ActionRunContext } from "@agent-native/core/action";
import { desc, eq } from "drizzle-orm";

import type { LedgerRow } from "../../shared/evidence-chain.js";
import { canonicalJSON, chainHash } from "./hash.js";
import { atomicMutation } from "./transactions.js";
export { checkChain, type LedgerRow } from "../../shared/evidence-chain.js";
import { getDb } from "../db/index.js";
import { ledger, ledgerHead } from "../db/schema.js";

export type CallerTag =
  | "ui"
  | "agent"
  | "mcp"
  | "cli"
  | "job"
  | "http"
  | "seed"
  | "system";

export function callerFor(ctx?: ActionRunContext): CallerTag {
  switch (ctx?.caller) {
    case "frontend":
      return "ui";
    case "tool":
      return "agent";
    case "mcp":
    case "mcp-widget":
    case "mcp-widget-write":
      return "mcp";
    case "webmcp":
      return "agent";
    case "cli":
      return "cli";
    case "automation":
      return "job";
    case "http":
      return "http";
    case "a2a":
      return "agent";
    default:
      return "system";
  }
}

export function actorFor(ctx?: ActionRunContext): string {
  return ctx?.userEmail ?? "operator@alora.local";
}

export interface LedgerInput {
  shipmentId: string;
  actionName: string;
  caller: CallerTag;
  actor?: string;
  payload: unknown;
  inverseAction: string;
  createdAt?: string;
}

/** The caller's domain writes and this append share the locked DB transaction. */
export const appendLedger = atomicMutation(
  async (input: LedgerInput): Promise<LedgerRow> => {
    const db = getDb();
    const [head] = await db
      .select()
      .from(ledgerHead)
      .where(eq(ledgerHead.id, "global"));
    const last = await db
      .select()
      .from(ledger)
      .orderBy(desc(ledger.id))
      .limit(1);
    if (
      !head ||
      head.tipId !== (last[0]?.id ?? 0) ||
      head.tipHash !== (last[0]?.entryHash ?? "GENESIS")
    ) {
      throw new Error("Ledger head does not match the stored chain");
    }
    const prevHash = head.tipHash;
    const createdAt = input.createdAt ?? new Date().toISOString();
    const payload = canonicalJSON({
      shipmentId: input.shipmentId,
      actionName: input.actionName,
      caller: input.caller,
      actor: input.actor ?? "operator@alora.local",
      inverseAction: input.inverseAction,
      createdAt,
      data: input.payload,
    });
    const entryHash = chainHash(prevHash, JSON.parse(payload) as unknown);
    const inserted = await db
      .insert(ledger)
      .values({
        shipmentId: input.shipmentId,
        prevHash,
        entryHash,
        payload,
        caller: input.caller,
        actionName: input.actionName,
        actor: input.actor ?? "operator@alora.local",
        inverseAction: input.inverseAction,
        createdAt,
      })
      .returning();
    const row = inserted[0];
    if (!row) throw new Error("Ledger append returned no row");
    await db
      .update(ledgerHead)
      .set({ tipId: row.id, tipHash: row.entryHash })
      .where(eq(ledgerHead.id, "global"));
    return row as LedgerRow;
  },
);

export async function ledgerEntries(shipmentId?: string): Promise<LedgerRow[]> {
  const db = getDb();
  const rows = shipmentId
    ? await db
        .select()
        .from(ledger)
        .where(eq(ledger.shipmentId, shipmentId))
        .orderBy(ledger.id)
    : await db.select().from(ledger).orderBy(ledger.id);
  return rows as LedgerRow[];
}

export { canonicalJSON };

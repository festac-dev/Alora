import { canonicalJSON, sha256 } from "../server/lib/hash.ts";

export interface LedgerRow {
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

/** Validate both the hash chain and the metadata used to interpret its events. */
export function checkChain(rows: LedgerRow[]): {
  valid: boolean;
  brokenAt: number | null;
  tipHash: string;
} {
  let prev = "GENESIS";
  let lastId = 0;
  for (const [index, row] of rows.entries()) {
    const broken = () => ({ valid: false, brokenAt: index, tipHash: prev });
    if (
      !Number.isSafeInteger(row.id) ||
      row.id <= lastId ||
      row.prevHash !== prev
    )
      return broken();
    if (sha256(row.prevHash + row.payload) !== row.entryHash) return broken();
    try {
      const payload = JSON.parse(row.payload);
      if (
        !payload ||
        typeof payload !== "object" ||
        canonicalJSON(payload) !== row.payload
      )
        return broken();
      for (const field of [
        "shipmentId",
        "actionName",
        "caller",
        "actor",
        "inverseAction",
      ] as const) {
        if (
          typeof row[field] !== "string" ||
          !row[field] ||
          payload[field] !== row[field]
        )
          return broken();
      }
      // SQL timestamptz can format the same instant differently from the bytes.
      const timestamp = Date.parse(row.createdAt);
      if (
        !Number.isFinite(timestamp) ||
        timestamp !== Date.parse(payload.createdAt)
      )
        return broken();
    } catch {
      return broken();
    }
    prev = row.entryHash;
    lastId = row.id;
  }
  return { valid: true, brokenAt: null, tipHash: prev };
}

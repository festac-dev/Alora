import { createHash } from "node:crypto";

/**
 * Deterministic JSON: object keys sorted at every level, arrays preserved in
 * order, and undefined members dropped. Unsupported values (functions,
 * symbols, bigint) throw instead of silently hashing something surprising.
 */
export function canonicalJSON(value: unknown): string {
  return serialize(value);
}

function serialize(value: unknown): string {
  if (value === null) return "null";

  const type = typeof value;
  if (type === "string") return JSON.stringify(value);
  if (type === "boolean") return value ? "true" : "false";
  if (type === "number") {
    if (!Number.isFinite(value as number)) {
      throw new TypeError("canonicalJSON cannot serialize non-finite numbers");
    }
    return JSON.stringify(value);
  }
  if (type === "undefined") return "null";
  if (type === "bigint" || type === "function" || type === "symbol") {
    throw new TypeError(`canonicalJSON cannot serialize ${type}`);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => serialize(entry)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${serialize(record[key])}`)
    .join(",")}}`;
}

export function sha256(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

export function hashBytes(bytes: string): string {
  return sha256(bytes);
}

export function chainHash(prevHash: string, entry: unknown): string {
  return sha256(prevHash + canonicalJSON(entry));
}

export function verifyChain(
  entries: Array<{
    prevHash: string;
    entryHash: string;
    payload: string;
  }>,
): { valid: boolean; brokenAt: number | null } {
  let prev = "GENESIS";
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!entry) return { valid: false, brokenAt: index };
    if (entry.prevHash !== prev) return { valid: false, brokenAt: index };
    const expected = sha256(entry.prevHash + entry.payload);
    if (expected !== entry.entryHash) return { valid: false, brokenAt: index };
    prev = entry.entryHash;
  }
  return { valid: true, brokenAt: null };
}

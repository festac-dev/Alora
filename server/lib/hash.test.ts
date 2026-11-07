import { describe, expect, it } from "vitest";

import { canonicalJSON, chainHash, sha256, verifyChain } from "./hash";

describe("canonical JSON", () => {
  it("sorts keys at every level", () => {
    expect(canonicalJSON({ b: 1, a: { d: 4, c: 3 } })).toBe(
      '{"a":{"c":3,"d":4},"b":1}',
    );
  });

  it("is stable regardless of insertion order", () => {
    const first = { z: [{ b: 2, a: 1 }], a: true };
    const second = { a: true, z: [{ a: 1, b: 2 }] };
    expect(canonicalJSON(first)).toBe(canonicalJSON(second));
  });

  it("preserves array order", () => {
    expect(canonicalJSON([3, 1, 2])).toBe("[3,1,2]");
  });

  it("drops undefined members and serializes null consistently", () => {
    expect(canonicalJSON({ a: undefined, b: null })).toBe('{"b":null}');
  });

  it("rejects non-finite numbers", () => {
    expect(() => canonicalJSON({ a: Number.NaN })).toThrow();
  });
});

describe("sha256", () => {
  it("matches the known digest of hello", () => {
    expect(sha256("hello")).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });
});

describe("hash chain", () => {
  it("is deterministic and 64 hex characters", () => {
    expect(chainHash("00", { x: 1 })).toBe(chainHash("00", { x: 1 }));
    expect(chainHash("00", { x: 1 })).toMatch(/^[a-f0-9]{64}$/);
  });

  it("changes when one field changes", () => {
    expect(chainHash("00", { x: 1 })).not.toBe(chainHash("00", { x: 2 }));
  });

  it("verifies a valid chain and detects a mutated payload", () => {
    const first = {
      prevHash: "GENESIS",
      payload: canonicalJSON({ action: "a" }),
    };
    const firstHash = sha256(first.prevHash + first.payload);
    const second = {
      prevHash: firstHash,
      payload: canonicalJSON({ action: "b" }),
    };
    const secondHash = sha256(second.prevHash + second.payload);
    const rows = [
      { ...first, entryHash: firstHash },
      { ...second, entryHash: secondHash },
    ];
    expect(verifyChain(rows).valid).toBe(true);
    const tampered = [
      rows[0]!,
      { ...rows[1]!, payload: canonicalJSON({ action: "c" }) },
    ];
    expect(verifyChain(tampered)).toEqual({ valid: false, brokenAt: 1 });
  });
});

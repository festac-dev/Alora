import type {
  EvidenceResult,
  EvidenceSnapshot,
} from "@shared/evidence-snapshot";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useEvidenceCheck } from "./useEvidenceCheck";

const { responses } = vi.hoisted(() => ({
  responses: new Map<string, () => Promise<EvidenceResult>>(),
}));
// Keep the real Query cache; replace only the framework action transport.
vi.mock("@agent-native/core/client/hooks", async () => {
  const { useQuery } = await import("@tanstack/react-query");
  return {
    useActionQuery: (
      _action: string,
      params: { shipmentId: string },
      options: { enabled: boolean; queryKeyScope: unknown[] },
    ) =>
      useQuery({
        queryKey: ["action", _action, params, ...options.queryKeyScope],
        queryFn: () => responses.get(params.shipmentId)!(),
        enabled: options.enabled,
        retry: false,
      }),
  };
});

function snapshot(
  id: string,
  change: Partial<EvidenceSnapshot> = {},
): EvidenceSnapshot {
  return {
    shipmentId: id,
    deliverableId: `document-${id}`,
    storedHash: `hash-${id}`,
    actualHash: `hash-${id}`,
    inputsHash: `inputs-${id}`,
    verificationRunId: `run-${id}`,
    approvalId: null,
    ledgerTip: "tip-1",
    ...change,
  };
}
function evidence(snapshot: EvidenceSnapshot): EvidenceResult {
  return {
    shipmentId: snapshot.shipmentId,
    snapshot,
    chainValid: true,
    brokenAtLedgerId: null,
    ledgerEntries: 3,
    globalLedgerEntries: 3,
    tipHash: snapshot.ledgerTip,
    deliverables: [],
    hasActiveDocument: true,
    allHashesMatch: true,
    historicalMismatches: 0,
    valid: true,
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}
let root: Root;
let container: HTMLDivElement;
let client: QueryClient;
let hook: ReturnType<typeof useEvidenceCheck>;
function Screen({ value }: { value: EvidenceSnapshot }) {
  hook = useEvidenceCheck(value.shipmentId, value);
  return <div>{hook.result ? hook.result.shipmentId : "Not recomputed"}</div>;
}
async function render(value: EvidenceSnapshot) {
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <Screen value={value} />
      </QueryClientProvider>,
    );
  });
}
beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  responses.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  container.remove();
});

describe("shipment evidence scope", () => {
  it("clears a displayed result when A changes to B", async () => {
    const a = snapshot("A");
    responses.set("A", async () => evidence(a));
    await render(a);
    await act(async () => {
      await hook.verify();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(container.textContent).toBe("A");
    await render(snapshot("B"));
    expect(container.textContent).toBe("Not recomputed");
  });

  it("ignores A's late response after selecting B", async () => {
    const pending = deferred<EvidenceResult>();
    const a = snapshot("A");
    responses.set("A", () => pending.promise);
    await render(a);
    let request!: Promise<EvidenceResult | null>;
    await act(async () => {
      request = hook.verify();
    });
    await render(snapshot("B"));
    await act(async () => {
      pending.resolve(evidence(a));
      await request;
    });
    expect(await request).toBeNull();
    expect(container.textContent).toBe("Not recomputed");
  });

  it("clears evidence at mutation start and rejects its in-flight response", async () => {
    const pending = deferred<EvidenceResult>();
    const a = snapshot("A");
    responses.set("A", () => pending.promise);
    await render(a);
    let request!: Promise<EvidenceResult | null>;
    await act(async () => {
      request = hook.verify();
    });
    await act(async () => hook.invalidate());
    await act(async () => {
      pending.resolve(evidence(a));
      await request;
    });
    expect(await request).toBeNull();
    expect(container.textContent).toBe("Not recomputed");
  });

  it("requires new evidence after repair, tampering, changed inputs or ledger updates", async () => {
    const a = snapshot("A");
    responses.set("A", async () => evidence(a));
    await render(a);
    await act(async () => {
      await hook.verify();
    });
    for (const change of [
      { deliverableId: "version-2" },
      { actualHash: "tampered" },
      { inputsHash: "changed" },
      { ledgerTip: "tip-2" },
    ]) {
      await render(snapshot("A", change));
      expect(container.textContent).toBe("Not recomputed");
    }
  });
});

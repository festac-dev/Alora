import { useActionQuery } from "@agent-native/core/client/hooks";
import {
  evidenceSnapshotKey,
  type EvidenceResult,
  type EvidenceSnapshot,
} from "@shared/evidence-snapshot";
import { useLayoutEffect, useRef, useState } from "react";

/** A late response stays in the cache for the snapshot that requested it. */
export function useEvidenceCheck(
  selectedId: string,
  snapshot: EvidenceSnapshot | undefined,
) {
  const [revision, setRevision] = useState(0);
  const snapshotKey = evidenceSnapshotKey(snapshot);
  const scope = JSON.stringify([selectedId, snapshotKey, revision]);
  const currentScope = useRef(scope);
  useLayoutEffect(() => {
    currentScope.current = scope;
  }, [scope]);
  const query = useActionQuery<EvidenceResult>(
    "verify-evidence-chain",
    { shipmentId: selectedId },
    {
      enabled: false,
      queryKeyScope: [scope],
    },
  );
  const result =
    query.data && evidenceSnapshotKey(query.data.snapshot) === snapshotKey
      ? query.data
      : null;
  return {
    result,
    invalidate() {
      // Invalidate in-flight requests immediately, before React renders the new scope.
      currentScope.current = "invalidated";
      setRevision((value) => value + 1);
    },
    async verify(): Promise<EvidenceResult | null> {
      const requestedScope = scope;
      const response = await query.refetch();
      if (currentScope.current !== requestedScope) return null;
      if (response.error) throw response.error;
      if (
        !response.data ||
        evidenceSnapshotKey(response.data.snapshot) !== snapshotKey
      )
        return null;
      return response.data;
    },
  };
}

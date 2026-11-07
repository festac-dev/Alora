import { eq } from "drizzle-orm";

import type { EvidenceResult } from "../../shared/evidence-snapshot.js";
import { getDb } from "../db/index.js";
import { deliverables as deliverablesTable } from "../db/schema.js";
import { hashBytes } from "./hash.js";
import { checkChain, ledgerEntries } from "./ledger.js";
import { getShipmentBundle } from "./queries.js";
import { snapshotQuery } from "./transactions.js";

export const inspectShipmentIntegrity = snapshotQuery(
  async (shipmentId: string): Promise<EvidenceResult> => {
    const bundle = await getShipmentBundle(shipmentId);
    if (!bundle) throw new Error(`Shipment ${shipmentId} not found`);
    const entries = await ledgerEntries(bundle.shipment.id);
    const globalEntries = await ledgerEntries();
    const chain = checkChain(globalEntries);
    const rows = await getDb()
      .select()
      .from(deliverablesTable)
      .where(eq(deliverablesTable.shipmentId, bundle.shipment.id));
    const deliverableChecks = rows.map((row) => {
      const recomputedHash = hashBytes(row.bytes);
      const submissionMatches = entries.some((entry) => {
        if (
          ![
            "builderClassify",
            "builderClassifyWithPlantedError",
            "submitDeliverable",
          ].includes(entry.actionName)
        )
          return false;
        try {
          const { data } = JSON.parse(entry.payload);
          return (
            data.deliverableId === row.id &&
            data.sha256 === row.sha256 &&
            data.version === row.version
          );
        } catch {
          return false;
        }
      });
      return {
        id: row.id,
        filename: row.filename,
        storedHash: row.sha256,
        recomputedHash,
        hashMatches: recomputedHash === row.sha256,
        submissionMatches,
        state: row.state,
      };
    });
    return {
      shipmentId: bundle.shipment.id,
      snapshot: bundle.snapshot,
      chainValid: chain.valid && bundle.chain.valid,
      brokenAtLedgerId:
        chain.brokenAt === null
          ? null
          : (globalEntries[chain.brokenAt]?.id ?? null),
      ledgerEntries: entries.length,
      globalLedgerEntries: globalEntries.length,
      tipHash: globalEntries[globalEntries.length - 1]?.entryHash ?? "GENESIS",
      deliverables: deliverableChecks,
      hasActiveDocument: Boolean(bundle.activeDeliverable),
      allHashesMatch:
        Boolean(bundle.activeDeliverable) &&
        deliverableChecks.every(
          (row) => row.hashMatches && row.submissionMatches,
        ),
      historicalMismatches: deliverableChecks.filter(
        (row) =>
          row.state !== "active" &&
          (!row.hashMatches || !row.submissionMatches),
      ).length,
      valid:
        chain.valid &&
        bundle.chain.valid &&
        Boolean(bundle.activeDeliverable?.hashMatches) &&
        Boolean(
          deliverableChecks.find(
            (row) => row.id === bundle.activeDeliverable?.id,
          )?.submissionMatches,
        ),
    };
  },
);

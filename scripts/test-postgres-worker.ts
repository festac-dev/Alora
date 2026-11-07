import { closeDbExec, getDatabaseUrl } from "@agent-native/core/db";

import {
  approveDeliverable,
  createShipment,
  runBuilder,
  tamperDeliverable,
} from "../server/lib/commands.js";

// Test-only child process: separate connection pool and transaction context.
const [operation, shipmentId, deliverableId] = process.argv.slice(2);
const database = new URL(getDatabaseUrl());
if (
  !["localhost", "127.0.0.1"].includes(database.hostname) ||
  !database.pathname.startsWith("/alora_test_")
)
  throw new Error(
    "This worker only runs on a disposable localhost alora_test_* database",
  );
const actor = {
  caller: "cli" as const,
  actor: "concurrency-test@example.com",
  authenticatedApprover: "concurrency-test@example.com",
};
try {
  let result: unknown;
  if (operation === "create") {
    result = await createShipment(
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
  } else if (operation === "build" && shipmentId)
    result = await runBuilder(shipmentId, actor);
  else if (operation === "tamper" && shipmentId)
    result = await tamperDeliverable(shipmentId, actor);
  else if (operation === "approve" && shipmentId && deliverableId) {
    try {
      result = await approveDeliverable(
        { shipmentId, deliverableId, approverKind: "human" },
        actor,
      );
    } catch (error) {
      result = {
        refused: error instanceof Error ? error.message : String(error),
      };
    }
  } else throw new Error("Unknown test operation");
  console.log(JSON.stringify(result));
} finally {
  await closeDbExec();
}

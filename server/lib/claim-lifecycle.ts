import { defineMachine } from "@agent-native/core/state-machine";
import { and, eq, isNull } from "drizzle-orm";

import { getDb } from "../db/index.js";
import { claims } from "../db/schema.js";

const states = ["claimed", "submitted", "verified", "human-approved"] as const;
export const claimMachine = defineMachine({
  id: "customs-claim",
  states,
  initial: "claimed",
  terminal: [],
  transitions: {
    submit: { from: states, to: "submitted" },
    verify: {
      from: ["submitted", "verified", "human-approved"],
      to: "verified",
    },
    approve: { from: ["verified"], to: "human-approved" },
    reverifyApproved: { from: ["human-approved"], to: "human-approved" },
    invalidate: { from: states, to: "submitted" },
    clear: { from: states, to: "claimed" },
  },
});

type ClaimPatch = Partial<
  Pick<
    typeof claims.$inferInsert,
    | "deliverableId"
    | "verificationRunId"
    | "inputsHash"
    | "tariffVersion"
    | "agentId"
    | "confidence"
    | "rationale"
  >
>;

/** Conditional transitions also reject stale state if a writer bypasses the domain lock. */
export async function transitionClaim(
  id: string,
  event: (typeof claimMachine.events)[number],
  patch: ClaimPatch = {},
): Promise<void> {
  const db = getDb();
  const [current] = await db.select().from(claims).where(eq(claims.id, id));
  if (!current) throw new Error("Claim not found");
  const status = claimMachine.transition(
    claimMachine.parseState(current.status),
    event,
  );
  const updated = await db
    .update(claims)
    .set({ ...patch, status, updatedAt: new Date().toISOString() })
    .where(
      and(
        eq(claims.id, id),
        eq(claims.status, current.status),
        current.deliverableId === null
          ? isNull(claims.deliverableId)
          : eq(claims.deliverableId, current.deliverableId),
        current.verificationRunId === null
          ? isNull(claims.verificationRunId)
          : eq(claims.verificationRunId, current.verificationRunId),
      ),
    )
    .returning({ id: claims.id });
  if (updated.length !== 1)
    throw new Error(
      "Claim changed during this operation. Refresh and try again.",
    );
}

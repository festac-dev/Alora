import { describe, expect, it } from "vitest";

import {
  evaluateApproval,
  evaluateTemplateReview,
  inverseFor,
  planRewind,
  type ApprovalPolicyInput,
} from "./policy";

const base: ApprovalPolicyInput = {
  approverKind: "human",
  approverRecordedKind: null,
  hashMatches: true,
  claimStatus: "verified",
  deliverableIsCurrent: true,
  verificationPassed: true,
  hasActiveApproval: false,
  tariffResolutionComplete: true,
  activeApprovalHashMatches: true,
  caller: "ui",
  authenticatedApprover: "operator@alora.local",
  requestedApprover: null,
};

describe("approval policy", () => {
  it("never treats an unacknowledged legacy approval as consent", () => {
    expect(
      evaluateApproval({
        ...base,
        hasActiveApproval: true,
        claimStatus: "human-approved",
        unconfirmedTariffCodes: ["61091000"],
        tariffBaseLevelAcknowledged: true,
        activeApprovalTariffAcknowledged: false,
      }).allowed,
    ).toBe(false);
    expect(
      evaluateApproval({
        ...base,
        hasActiveApproval: true,
        claimStatus: "human-approved",
        unconfirmedTariffCodes: ["61091000"],
        activeApprovalTariffAcknowledged: true,
      }).allowed,
    ).toBe(true);
  });

  it("requires current proof and a matching hash even for repeated approval", () => {
    expect(
      evaluateApproval({
        ...base,
        hasActiveApproval: true,
        claimStatus: "human-approved",
        verificationPassed: false,
      }).allowed,
    ).toBe(false);
    expect(
      evaluateApproval({
        ...base,
        hasActiveApproval: true,
        claimStatus: "human-approved",
        activeApprovalHashMatches: false,
      }).allowed,
    ).toBe(false);
    expect(
      evaluateApproval({ ...base, tariffResolutionComplete: false }).allowed,
    ).toBe(false);
    expect(
      evaluateApproval({ ...base, caller: "unknown-surface" }).allowed,
    ).toBe(false);
  });
  it("allows a human to approve a verified, unchanged artifact", () => {
    expect(evaluateApproval(base)).toEqual({
      allowed: true,
      reason: "Approval may be bound to the verified hash.",
    });
  });

  it("rejects an agent approver", () => {
    expect(evaluateApproval({ ...base, approverKind: "agent" }).allowed).toBe(
      false,
    );
  });

  it("rejects a recorded agent identity even when the caller claims human", () => {
    expect(
      evaluateApproval({ ...base, approverRecordedKind: "agent" }).allowed,
    ).toBe(false);
  });

  it("rejects agent, MCP and background surfaces", () => {
    for (const caller of ["agent", "mcp", "job", "seed", "system"]) {
      expect(evaluateApproval({ ...base, caller }).allowed).toBe(false);
    }
  });

  it("requires an authenticated operator identity", () => {
    expect(
      evaluateApproval({ ...base, authenticatedApprover: null }).allowed,
    ).toBe(false);
    expect(
      evaluateApproval({
        ...base,
        requestedApprover: "someone-else@example.com",
      }).allowed,
    ).toBe(false);
  });

  it("rejects approval after the bytes change", () => {
    const decision = evaluateApproval({ ...base, hashMatches: false });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("changed after verification");
  });

  it("rejects approval before verification passes", () => {
    expect(
      evaluateApproval({ ...base, claimStatus: "submitted" }).allowed,
    ).toBe(false);
    expect(
      evaluateApproval({ ...base, verificationPassed: false }).allowed,
    ).toBe(false);
  });

  it("rejects a superseded deliverable", () => {
    expect(
      evaluateApproval({ ...base, deliverableIsCurrent: false }).allowed,
    ).toBe(false);
  });

  it("treats re-approval of an already approved hash as idempotent", () => {
    expect(
      evaluateApproval({
        ...base,
        claimStatus: "human-approved",
        hasActiveApproval: true,
      }),
    ).toEqual({
      allowed: true,
      reason: "An active approval already binds this exact hash.",
    });
  });

  it("requires an explicit acknowledgement for base-level tariff rows", () => {
    const blocked = evaluateApproval({
      ...base,
      unconfirmedTariffCodes: ["85176200"],
      tariffBaseLevelAcknowledged: false,
    });
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toContain("National tariff suffix is unconfirmed");

    expect(
      evaluateApproval({
        ...base,
        unconfirmedTariffCodes: ["85176200"],
        tariffBaseLevelAcknowledged: true,
      }).allowed,
    ).toBe(true);
  });

  it("does not require acknowledgement when every tariff row is confirmed", () => {
    expect(
      evaluateApproval({
        ...base,
        unconfirmedTariffCodes: [],
        tariffBaseLevelAcknowledged: false,
      }).allowed,
    ).toBe(true);
  });
});

describe("template review gate", () => {
  const reviewed = {
    status: "reviewed",
    codeSha256: "a".repeat(64),
    reviewedCodeSha256: "a".repeat(64),
    reviewedBy: "operator@alora.local",
  };

  it("refuses activation before a human review", () => {
    const decision = evaluateTemplateReview({
      ...reviewed,
      status: "pending",
      reviewedCodeSha256: null,
      reviewedBy: null,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("reviewed by a human");
  });

  it("refuses activation when the template changed after review", () => {
    const decision = evaluateTemplateReview({
      ...reviewed,
      codeSha256: "b".repeat(64),
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("changed after review");
  });

  it("allows activation of the reviewed bytes", () => {
    expect(evaluateTemplateReview(reviewed).allowed).toBe(true);
  });

  it("refuses a second activation", () => {
    expect(
      evaluateTemplateReview({ ...reviewed, status: "active" }).allowed,
    ).toBe(false);
  });
});

describe("inverse actions and rewind planning", () => {
  it("maps every mutating action to an inverse", () => {
    expect(inverseFor("approveDeliverable")).toBe("revokeApproval");
    expect(inverseFor("builderClassify")).toBe("retractDeliverable");
    expect(inverseFor("verifierCheck")).toBe("invalidateVerification");
    expect(inverseFor("forkShipment")).toBe("archiveFork");
    expect(inverseFor("reviewProposedAction")).toBe("rejectProposal");
    expect(inverseFor("unknownAction")).toBe("noop");
  });

  it("plans compensating events in reverse order and rejects unknown targets", () => {
    const entries = [
      { id: 1, actionName: "createShipment" },
      { id: 2, actionName: "builderClassify" },
      { id: 3, actionName: "verifierCheck" },
      { id: 4, actionName: "approveDeliverable" },
    ];
    const plan = planRewind(entries, 2);
    expect(plan.valid).toBe(true);
    expect(plan.entries.map((entry) => entry.id)).toEqual([3, 4]);
    expect(plan.inverses).toEqual(["revokeApproval", "invalidateVerification"]);
    expect(planRewind(entries, 99).valid).toBe(false);
  });
});

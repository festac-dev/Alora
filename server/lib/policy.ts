export interface ApprovalPolicyInput {
  approverKind: string;
  approverRecordedKind?: string | null;
  hashMatches: boolean;
  claimStatus: string;
  deliverableIsCurrent: boolean;
  verificationPassed: boolean;
  hasActiveApproval: boolean;
  tariffResolutionComplete: boolean;
  activeApprovalHashMatches?: boolean;
  activeApprovalTariffAcknowledged?: boolean;
  caller: string;
  authenticatedApprover?: string | null | undefined;
  requestedApprover?: string | null | undefined;
  /** Base-level tariff codes whose national suffix is still unconfirmed. */
  unconfirmedTariffCodes?: string[] | undefined;
  /** A human explicitly accepted approval at the stored base level. */
  tariffBaseLevelAcknowledged?: boolean | undefined;
}

export interface HumanReviewInput {
  caller: string;
  authenticatedApprover?: string | null | undefined;
  requestedApprover?: string | null | undefined;
}

const HUMAN_CALLERS = new Set(["ui", "cli", "http"]);

export function evaluateHumanReview(input: HumanReviewInput): {
  allowed: boolean;
  reason: string;
  approverId: string | null;
} {
  if (!HUMAN_CALLERS.has(input.caller)) {
    return {
      allowed: false,
      reason:
        "This surface is agent-driven. Human approval must come from an authenticated UI or CLI operator.",
      approverId: null,
    };
  }
  if (!input.authenticatedApprover) {
    return {
      allowed: false,
      reason:
        "Human approval requires an authenticated operator identity. Sign in and try again.",
      approverId: null,
    };
  }
  if (
    input.requestedApprover &&
    input.requestedApprover !== input.authenticatedApprover
  ) {
    return {
      allowed: false,
      reason:
        "Approval identity does not match the authenticated operator and cannot be asserted by the caller.",
      approverId: null,
    };
  }
  return {
    allowed: true,
    reason: "Authenticated human operator.",
    approverId: input.authenticatedApprover,
  };
}

export interface TemplateReviewInput {
  status: string;
  codeSha256: string;
  reviewedCodeSha256: string | null;
  reviewedBy: string | null;
}

/**
 * A template-based capability may only activate when a human reviewed the exact
 * code hash that is stored now. A silent template edit invalidates the review.
 */
export function evaluateTemplateReview(input: TemplateReviewInput): {
  allowed: boolean;
  reason: string;
} {
  if (input.status === "active") {
    return { allowed: false, reason: "Capability is already active." };
  }
  if (
    input.status !== "reviewed" ||
    !input.reviewedBy ||
    !input.reviewedCodeSha256
  ) {
    return {
      allowed: false,
      reason:
        "The template must be reviewed by a human before it can be activated.",
    };
  }
  if (input.reviewedCodeSha256 !== input.codeSha256) {
    return {
      allowed: false,
      reason:
        "The template changed after review. Review the current code again before activating.",
    };
  }
  return {
    allowed: true,
    reason: "Reviewed template matches the stored code.",
  };
}

export function evaluateApproval(input: ApprovalPolicyInput): {
  allowed: boolean;
  reason: string;
} {
  if (
    input.approverKind !== "human" ||
    input.approverRecordedKind === "agent"
  ) {
    return {
      allowed: false,
      reason: "Agents cannot approve work. A human operator must approve.",
    };
  }
  const identity = evaluateHumanReview({
    caller: input.caller,
    authenticatedApprover: input.authenticatedApprover,
    requestedApprover: input.requestedApprover,
  });
  if (!identity.allowed) {
    return { allowed: false, reason: identity.reason };
  }
  if (!input.hashMatches) {
    return {
      allowed: false,
      reason:
        "Deliverable changed after verification. Approval refused and existing approval revoked.",
    };
  }
  if (!input.deliverableIsCurrent) {
    return {
      allowed: false,
      reason: "Deliverable is not the claim's current artifact",
    };
  }
  if (!input.tariffResolutionComplete) {
    return {
      allowed: false,
      reason:
        "The cited tariff version is unavailable or ambiguous. Approval requires resolved tariff evidence.",
    };
  }
  if (input.hasActiveApproval && !input.activeApprovalHashMatches) {
    return {
      allowed: false,
      reason: "The existing approval does not bind the current verified hash.",
    };
  }
  if (!input.verificationPassed) {
    return {
      allowed: false,
      reason: "No passing verification run exists for this exact deliverable",
    };
  }
  const unconfirmedCodes = input.unconfirmedTariffCodes ?? [];
  const acknowledged = input.hasActiveApproval
    ? input.activeApprovalTariffAcknowledged
    : input.tariffBaseLevelAcknowledged;
  if (unconfirmedCodes.length > 0 && !acknowledged) {
    return {
      allowed: false,
      reason: `National tariff suffix is unconfirmed for ${unconfirmedCodes.join(", ")}. Confirm it with the destination authority or explicitly acknowledge the base-level estimate before approval.`,
    };
  }
  // Idempotency never skips proof or stored consent checks.
  if (
    input.claimStatus !== "verified" &&
    !(input.claimStatus === "human-approved" && input.hasActiveApproval)
  ) {
    return {
      allowed: false,
      reason: "Only verified deliverables can be approved",
    };
  }
  if (input.hasActiveApproval) {
    return {
      allowed: true,
      reason: "An active approval already binds this exact hash.",
    };
  }
  return {
    allowed: true,
    reason: "Approval may be bound to the verified hash.",
  };
}

export const INVERSE_ACTIONS: Record<string, string> = {
  createShipment: "archiveShipment",
  approveDeliverable: "revokeApproval",
  builderClassify: "retractDeliverable",
  builderClassifyWithPlantedError: "retractDeliverable",
  submitDeliverable: "retractDeliverable",
  repairDeliverable: "retractDeliverable",
  verifierCheck: "invalidateVerification",
  forkShipment: "archiveFork",
  sendCourierEmail: "retractOutreach",
  approveCourierDraft: "revokeOutreachApproval",
  proposeAction: "rejectProposal",
  reviewProposedAction: "rejectProposal",
  approveProposedAction: "rejectProposal",
  spawnSpecialist: "retireAgent",
  tamperDetected: "noop",
  auditorReview: "noop",
  surgeVerify: "noop",
  rewindShipment: "rewindShipment",
};

export function inverseFor(actionName: string): string {
  return INVERSE_ACTIONS[actionName] ?? "noop";
}

export interface RewindEntryLike {
  id: number;
  actionName: string;
}

export function planRewind<T extends RewindEntryLike>(
  entries: T[],
  targetId: number,
): { entries: T[]; inverses: string[]; valid: boolean } {
  const target = entries.find((entry) => entry.id === targetId);
  if (!target) {
    return { entries: [], inverses: [], valid: false };
  }
  const after = entries.filter((entry) => entry.id > targetId);
  return {
    entries: after,
    inverses: [...after].reverse().map((entry) => inverseFor(entry.actionName)),
    valid: true,
  };
}

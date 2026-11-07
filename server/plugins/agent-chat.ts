import { getOrgContext } from "@agent-native/core/org";
import {
  createAgentChatPlugin,
  loadActionsFromStaticRegistry,
} from "@agent-native/core/server";

import actionsRegistry from "../../.generated/actions-registry.js";

const INITIAL_TOOL_NAMES = [
  "list-shipments",
  "get-shipment",
  "create-shipment",
  "architect-plan",
  "builder-classify",
  "auditor-review",
  "verifier-check",
  "approve-deliverable",
  "fork-shipment",
  "rewind-shipment",
  "verify-evidence-chain",
  "seed-demo",
];

export default createAgentChatPlugin({
  appId: "alora",
  actions: loadActionsFromStaticRegistry(actionsRegistry),
  mcp: {
    // External agents get the read and build surface. The human gates
    // (approve-deliverable, review/activate proposal, courier release) are
    // deliberately absent: every one of them refuses agent callers anyway, and
    // keeping them off the catalog means an external client never sees a route
    // that could look like approval.
    connectorCatalog: [
      "list-shipments",
      "get-shipment",
      "create-shipment",
      "architect-plan",
      "builder-classify",
      "auditor-review",
      "verifier-check",
      "repair-deliverable",
      "fork-shipment",
      "rewind-shipment",
      "verify-evidence-chain",
      "export-shipment",
      "intake-shipment",
    ],
    appApprovalPage: true,
  },
  initialToolNames: INITIAL_TOOL_NAMES,
  resolveOrgId: async (event) => (await getOrgContext(event)).orgId,
  systemPrompt: `You are Alora, a verified mission control for regulated cross-border work.

Core invariant: no work counts as done until deterministic checks pass, the deliverable's exact SHA-256 is locked, and a human approves that exact hash. Agents may build, audit and verify. Agents may never approve or release work.

Use the shared actions instead of restating facts:
- list-shipments and get-shipment read the live evidence bundle.
- create-shipment, architect-plan, builder-classify, auditor-review and verifier-check run the workflow.
- approve-deliverable requires a human identity; never try to bypass it.
- verify-evidence-chain recomputes every hash and the ledger chain.
- seed-demo resets the demo. Only call it when the user explicitly asks.

Never invent tariff rates or claim a check passed without reading the action result. Say "estimate, not legal advice" whenever you discuss duty, VAT or landed cost.`,
});

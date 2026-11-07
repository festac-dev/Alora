# Alora security model

## Protected invariant

An agent can never approve its own work or release a shipment. Approval is bound
to the exact bytes a human saw, and those bytes must still hash to the verified
digest.

This is enforced inside `approve-deliverable` / `server/lib/commands.ts`, not in
the UI. UI, agent, HTTP, MCP, A2A and CLI callers all hit the same check.

## Checks

| Risk                               | Control                                                                                                                                                                |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agent self-approval                | `approverKind` must be `human`; ids present in `agents` are rejected; agent/MCP/background caller surfaces are rejected                                                |
| Approval impersonation             | approval binds to the authenticated `ctx.userEmail`; an input `approverId` that differs is rejected; unauthenticated approvals are refused                             |
| Document replacement               | verifier re-hashes stored bytes; approval refuses on mismatch and revokes existing approvals                                                                           |
| Stale approval                     | the claim's current policy-versioned proof must bind the exact bytes and source inputs, and match its ledger event; fresh checks are compared before approval          |
| Superseded artifact                | only the claim's current, active deliverable can be approved; a new version revokes the prior approval                                                                 |
| Unconfirmed national tariff suffix | trusted, precisely cited rows determine required consent even when legacy document flags are absent; stored acknowledgement and codes are rechecked on repeat approval |
| Ledger editing                     | hash chain and duplicated metadata are checked; exports cross-check submissions, proofs, approvals, counts and current pointers                                        |
| Concurrent or partial writes       | the database ledger-head lock and one transaction cover domain state, evidence and ledger; nested commands reuse the boundary                                          |
| Rewind resurrecting approval       | rewind clears proof pointers, retains history and revokes active approvals; restored bytes require a new verification and human approval                               |
| Arbitrary code execution           | self-extension activates a reviewed template behind a server-side gate; no generated code is evaluated                                                                 |
| Outreach leak                      | draft is hash-bound; send requires a human approval and unchanged bytes; transport is a mock                                                                           |
| SQL injection                      | Drizzle query builder, Zod input validation, no raw user interpolation                                                                                                 |
| Secrets                            | no credentials committed; provider keys, if any, belong in the deployment environment                                                                                  |

## Data boundaries

- Single-tenant workspace. There is no per-user row scoping. Every authenticated
  operator sees every shipment. This is a hard constraint of the current build:
  lifting it needs tenant ids on every table, scoped queries and tenant-scoped
  keys.
- PostgreSQL writers lock the same singleton head before mutating domain data.
  This serializes transactions across processes. Direct SQL writes bypass the
  action boundary and remain a privileged operation. PGlite still permits only
  one owning process.
- `approvals`, `verification_runs`, `evidence` and `ledger` are treated as
  append-only. The only update to `approvals` is `revoked = true`, which is a
  compensating state change, not a deletion.
- Deliverable bytes are stored in the database for this demo. Production should
  move large documents to blob storage and keep only the handle plus hash in SQL.
- No sanctions screening, licensing check or broker integration is claimed.
- UAE tariff rows are stored at the 8-digit GCC/HS base and flagged
  `nationalSuffixUnconfirmed`. The verifier warns; it does not imply a full
  tariff-line match. Approval is refused until a human explicitly acknowledges
  that the national suffix is unconfirmed.

## Deployment note

Stop the old app before migration 5 so every subsequent writer uses the ledger
lock. The migration does not reinterpret old evidence as a current proof.
Duplicate versions or active records stop the upgrade before domain changes;
reconcile them while preserving history and retry. The global lock favors
consistency; keep transactions short.

Manifest validation proves consistency against the included ledger and the
bundled tariff snapshots. It cannot authenticate a wholly rewritten export
without an independently retained ledger tip. Use `--expected-tip` when one is
available. The ledger's human identity fields are attribution, not signatures.

## MCP / HTTP

The framework mounts `/mcp` and action HTTP routes. Authentication is provided by
the framework (OAuth or bearer tokens).

The MCP catalog is scoped in `server/plugins/agent-chat.ts`: external agents see
the read and build actions only. The human gates (`approve-deliverable`,
`review-proposed-action`, `approve-proposed-action`, `approve-courier-draft`,
`send-courier-email`) are not in the catalog, so a connected client cannot even
attempt them; a direct call is answered with `Unknown tool`. The approval gate
still lives inside the action for every other surface.

An authenticated MCP session was exercised end to end against a locally hosted
instance (`pnpm mcp:smoke`): initialize, tools/list, `create-shipment`,
`builder-classify`, `verifier-check`, `verify-evidence-chain`,
`export-shipment`, a read back showing the ledger row tagged `caller = "mcp"`,
and a refused approval attempt with no approval recorded. No public deployment
was made; the probe is the same command against a staging URL once one exists.

## Secrets

- `.env` is git-ignored.
- `DATABASE_URL` is deployment configuration.
- No API key is required for the seeded workflow, deterministic checks, tests or
  the UI.
- An optional LLM provider key is only for the in-app chat agent.

## Reporting

If you find a bypass, capture the action name, caller surface, input, observed
ledger row and expected invariant. Do not include secrets or customer data.

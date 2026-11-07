# Alora — Agent Guide

Alora is a verified mission control for regulated cross-border work. The primary
experience is `/control` (full-bleed dark command surface), with dedicated
`/control/shipments`, `/control/evidence`, `/control/replay`, `/control/agents`,
and `/control/extensions` routes. `/` is the public landing page; `/home`
redirects to `/control`. The Chat scaffold remains at `/chat` as the in-app agent surface.

Core invariant: no claim becomes `verified` by narration, and no agent approves
work. The verifier re-hashes stored bytes and recomputes every amount. Human
approval binds to one SHA-256. Tampering or a new version revokes it. Every
mutation appends to the hash-chained ledger with its caller and inverse action.
A package that cites base-level GCC/HS rows needs an explicit human
acknowledgement before approval.
Resolve that requirement from the precisely cited trusted tariff row, including
for legacy documents without flags. Current approval requires the claim's
policy-versioned proof, exact bytes, source input fingerprint and ledger binding.

## Skills

Search with `rg --hidden --follow`; read the exact linked guide before deeper
work. `.agents/skills/actions/SKILL.md` (action contract),
`.agents/skills/storing-data/SKILL.md` (SQL/Drizzle), `real-time-sync`,
`reliable-mutations`, `frontend-design`, `security`, `performance`,
`customizing-agent-native`.

Use local docs only: `pnpm action docs-search --query "<topic>"`,
`pnpm action docs-search --slug "<slug>"`, `pnpm action source-search --query
"<pattern>"`.

## Core rules

- Every capability is one `defineAction()` in `actions/`, default-exported and
  named by its filename. Do not add a parallel REST backend.
- UI reads/writes through `useActionQuery` / `useActionMutation`.
- Normal app data lives in SQL via `server/db`. Never store large blobs or
  base64 in SQL.
- Preserve the approval invariant. It lives in `server/lib/policy.ts` and
  `approve-deliverable`; never move it to the client. Base-level tariff rows
  require the acknowledgement flag; do not default it to true.
- Additive, named migrations only in `server/plugins/db.ts`.
- Domain writes use `atomicMutation`; nested commands reuse the transaction and
  database ledger-head lock. Bundle/export reads use `snapshotQuery`.
- Rebuild, tamper and rewind clear the current proof pointer. Rewind preserves
  historical rows and never restores an old approval. Unchanged re-verification
  preserves a valid human approval.
- Keep manifest v2 validation in `shared/manifest.ts` and UI evidence results
  scoped to their full shipment/version/hash/input/ledger snapshot.
- Never fabricate tariff rates. Add a cited, versioned row in
  `data/tariff/<JURISDICTION>.json` or fail the check.
- Never claim an integration or check passed without observing the result.

## Application state

`/control` uses search params `id` (shipment) and `tab` (`canvas`, `evidence`,
`replay`, `universe`, `extensions`). The UI reads `list-shipments`,
`get-shipment` and `list-agents`.

## Primary actions

| Action                                                                                      | Use                                               |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `list-shipments`, `get-shipment`                                                            | Read summaries / full evidence bundle             |
| `create-shipment`                                                                           | Create from UI, agent, HTTP or MCP                |
| `architect-plan`                                                                            | Mission, criteria, tasks                          |
| `builder-classify`                                                                          | Classify, calculate, submit immutable version     |
| `auditor-review`                                                                            | Adversarial findings                              |
| `verifier-check`                                                                            | Deterministic checks, claim transition            |
| `approve-deliverable`                                                                       | Human-only hash-bound approval                    |
| `repair-deliverable`, `self-heal-document`                                                  | New version, approval invalidated                 |
| `tamper-deliverable`                                                                        | Integrity probe (demo)                            |
| `fork-shipment`, `spawn-specialist`                                                         | Destination recalculation, country desks          |
| `rewind-shipment`                                                                           | Compensating ledger events                        |
| `verify-evidence-chain`, `export-shipment`                                                  | Proof and manifest                                |
| `intake-shipment`                                                                           | Deterministic text intake with human confirmation |
| `draft-courier-email`, `approve-courier-draft`, `send-courier-email`                        | Gated outreach                                    |
| `propose-action`, `review-proposed-action`, `approve-proposed-action`, `check-arabic-label` | Template review, then activation                  |
| `surge-verify`, `generate-demo`, `seed-demo`                                                | Checkers, demo, reset                             |

## UI contract

`DESIGN.md` is the written contract; `app/global.css` holds the tokens. The
control surface is dark, neutral plus one accent, with no gradients or glows and
motion only for state changes. Titles are nouns, buttons are verb + object, and
setup instructions stay out of the app. The tour shows once and reopens from
Help.

## Workflow when changing code

1. Read `README.md`, `ARCHITECTURE.md`, `SECURITY.md`.
2. Keep deterministic logic out of React. Put it in `server/lib` and test it.
3. Update the action `schema` and `outputSchema` together.
4. Run `pnpm test`, `pnpm typecheck`, `pnpm build`.
5. Browser-check `/control` including Reset demo → repair → verify → approve →
   tamper → rewind → export.
6. Stop `pnpm dev` before running CLI actions: PGlite is single-process.
7. For MCP changes, run `pnpm mcp:smoke` against a running server and confirm the
   ledger row is tagged `mcp`.

For a feature checklist, use `.agents/skills/adding-a-feature/SKILL.md`.
Guarded verification: `pnpm agent-native:doctor`; fix findings before done.

# Alora handoff

## What exists

Alora is an Agent-Native app. `/` introduces the product; `/control` is the
workspace, with direct shipment, evidence, replay, agent, and extension pages.
`/home` redirects to `/control`. `/chat` is the in-app agent surface.

Read these first:

1. `README.md` — what shipped, judge walkthrough, limitations.
2. `ARCHITECTURE.md` — action/domain/integrity layers.
3. `IMPLEMENTATION_STATUS.md` — shipped vs not shipped.
4. `SECURITY.md` — approval invariant and boundaries.

## Run it

```bash
pnpm install
DATABASE_URL=pglite:./data/pglite pnpm dev
# open http://localhost:8080/control
```

Then click **Reset demo**. The seed is also available as
`pnpm action seed-demo`, but PGlite is single-process, so stop `pnpm dev` first.

## Verify it

```bash
pnpm test        # 46 tests
pnpm typecheck
pnpm build
pnpm mcp:smoke   # authenticated MCP session, server running
```

Manual end-to-end path that was exercised:

1. `seed-demo` → DE-2026-001 rejected on `vat-total`.
2. `repair-deliverable` → v2.
3. `verifier-check` → verified.
4. Approve the verified hash in the UI as the signed-in operator.
   CLI approval is refused without an authenticated operator session, so use the
   UI for this step.
5. Same action with `agent-builder` → rejected.
6. `tamper-deliverable` → mismatch + approval revoked.
7. `fork-shipment --destination US` → different landed cost + US desks.
8. `rewind-shipment --toLedgerId <entry>` → inverse events append.
9. `verify-evidence-chain` → global chain valid.
10. `export-shipment` → manifest with global final hash.

## Code map

- `actions/` — 34 Agent-Native actions; one capability per file.
- `server/db/schema.ts` + `server/plugins/db.ts` — Drizzle schema and additive
  migration (table `alora_migrations`).
- `server/lib/document.ts` — classification, CIF allocation, duty/VAT/landed cost.
- `server/lib/verification.ts` — verifier checks.
- `server/lib/auditor.ts` — adversarial findings.
- `server/lib/policy.ts` — approval policy, inverse map, rewind planner.
- `server/lib/hash.ts` — canonical JSON, SHA-256, chain verify.
- `server/lib/ledger.ts` — serialized append + caller/actor mapping.
- `server/lib/commands.ts` — workflow commands (create, build, verify, approve,
  tamper, repair, fork, rewind, export, spawn, reset).
- `server/lib/extensions.ts` — seed, intake, outreach, template review and
  activation, surge, demo, self-heal, Arabic label check.
- `app/components/alora/` — control shell, five tabs, Help dialog and tour.
- `scripts/mcp-smoke.mjs` — authenticated MCP session probe.
- `data/tariff/` — frozen cited snapshots with `codeLevel` and
  `nationalSuffixUnconfirmed`.
- `DESIGN.md` — the UI contract and the recorded design decisions.

## Known sharp edges

- The ledger chain is global (all shipments/workspace events), while each
  shipment bundle shows only its own rows. `getShipmentBundle` verifies the
  global chain and returns `chain.globalEntries`; do not change this back to a
  filtered chain check.
- `resetWorkspace` deletes ledger rows but PostgreSQL identity ids keep
  increasing. Never hardcode ledger ids in demos; read them from the bundle.
- `runBuilder` supersedes all previous deliverables, revokes any active
  approval on them and creates version N+1. Approval must be re-run after every
  repair/self-heal.
- `tamper-deliverable` mutates bytes in place and deliberately leaves the stored
  hash untouched. It is a demo probe, not a production endpoint.
- Capabilities activate only from a reviewed template: `review-proposed-action`
  binds the code hash, and `approve-proposed-action` refuses if the template
  changed afterwards. Nothing is generated or evaluated at runtime; do not
  change this without adding a sandbox.
- The MCP catalog in `server/plugins/agent-chat.ts` intentionally omits the
  human gates. Adding `approve-deliverable` there would still be refused by the
  action, but it would advertise a route that must never look agent-callable.
- UAE tariff rows are base-level and flagged; the verifier emits a
  `tariff-line-level` warning rather than failing the package. Approval is
  blocked until a human acknowledges the base-level estimate; the
  acknowledgement is stored on the approval and in the export manifest.
- `node-pty` was removed because the sandbox has no C toolchain. The terminal
  extension in the scaffold is therefore unavailable; Alora does not use it.
- `pnpm action ...` and `pnpm dev` cannot share the PGlite file at the same time.
- The workspace is single-tenant and the ledger mutex is per process. Both are
  hard constraints documented in `README.md` and `SECURITY.md`; lifting either
  is a schema/locking change, not a config flag.

## If you continue

Highest-value next steps:

1. Deploy with a hosted PostgreSQL `DATABASE_URL`; run `pnpm migrate:production`,
   then rerun `pnpm mcp:smoke` against the staging URL. The probe now exercises
   create, build, verify, chain-check and export over MCP.
2. Replace the text intake fallback with a real attachment → model extraction
   path that stores only a blob handle.
3. Add sanctions/licensing checks as deterministic rules with their own cited
   datasets.
4. Move money to integer minor units and add a property-based fuzz test for the
   verifier.
5. Add an end-to-end test that boots the server, seeds, approves, tampers,
   rewinds and exports.

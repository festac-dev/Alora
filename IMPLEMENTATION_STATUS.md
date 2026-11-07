# Implementation status

Last updated: 2026-11-05.

## Shipped and exercised

| Area | Status | Evidence |
| --- | --- | --- |
| Agent-Native actions | Shipped | 34 actions in `actions/`, all UI calls go through hooks |
| Drizzle/Postgres schema | Shipped | 14 tables, four additive named migrations |
| Seed demo with planted €4.20 VAT error | Shipped | `pnpm action seed-demo` → rejected `vat-total` |
| Four agents | Shipped | architect, builder, auditor, verifier actions + shared domain |
| Deterministic verifier | Shipped | 14–21 checks per package, unit tested |
| SHA-256 deliverable lock | Shipped | hash on submit, re-hash on verify |
| Human-only approval | Shipped | policy unit tests; CLI agent approval rejected |
| Approval revocation on byte change | Shipped | `tamper-deliverable`; a new version revokes the prior approval |
| Hash-chained ledger | Shipped | global chain verification, unit tested |
| Caller attribution | Shipped | `ui`/`agent`/`mcp`/`cli`/`job`/`seed` mapping |
| Authenticated MCP session | Shipped | `pnpm mcp:smoke`: tools/list, create, build, verify, chain check, export, ledger `caller=mcp`, approval refused |
| Evidence Room | Shipped | chain, hashes, checks, approvals, evidence, canonical doc |
| Rewind | Shipped | compensating events; policy + CLI verified |
| Fork DE→US/AE | Shipped | destination tariff recalculation; CLI fork to US |
| Country desks | Shipped | `spawn-specialist` from fork |
| Export manifest | Shipped | deliverable hashes, approvals, tariff level flags, final ledger hash |
| Replay | Shipped | ledger timeline + rewind |
| Agents | Shipped | SVG graph + ledger-derived trust table |
| Deterministic text intake | Shipped | pasted list parser, human confirmation |
| Visual self-heal | Shipped | preview patches, apply creates new version, revokes approval |
| Approval-gated courier outreach | Shipped | draft → human approval → mock send |
| Template review gate | Shipped | review binds the code hash; activation refuses a changed template |
| Tariff code levels | Shipped | `codeLevel` + `nationalSuffixUnconfirmed`; AE warns `tariff-line-level` |
| Base-level approval gate | Shipped | AE approval requires an explicit acknowledgement stored on the approval |
| Surge | Shipped | 1–8 bounded deterministic checkers, zero model cost |
| Self-demo generator | Shipped | ledger-derived script + click path, refuses empty ledger |
| Control surface UI contract | Shipped | `DESIGN.md` applied; tour on first visit, Help reopens it |
| Unit tests | Shipped | 46 tests, all passing |
| TypeScript | Shipped | `pnpm typecheck` passes |
| README + architecture + security + design + demo docs | Shipped | this repo |

## Not shipped / not verified

- Public deployment and staging URL (no hosting credentials in this workspace).
  The authenticated MCP probe ran against a locally hosted instance.
- Multimodal image/receipt extraction (deterministic text intake only).
- UAE national 12-digit suffix lookup. Rows are marked as base level and the
  verifier warns; nothing claims a full national tariff line.
- Per-user tenancy, passkeys, public `/verify` + QR.
- Sanctions screening and licensing checks.
- Tariff fetch automation; snapshots are frozen and versioned.
- Merkle checkpoints and PDF certificates.
- Production blob storage for large deliverables.
- Integration test against a booted server for approval/rewind; those paths were
  exercised through the CLI and UI and covered by policy unit tests.
- Horizontal scaling of ledger appends; the mutex is per process and documented
  as a hard constraint.

## Hard constraints

- Single-tenant workspace, no per-user row scoping.
- Ledger appends are serialized per server process.
- UAE tariff rows stop at the 8-digit GCC/HS base level; approval requires an
  explicit human acknowledgement of the unconfirmed national suffix.
- Capabilities activate only from a reviewed template; no generated code runs.

## Commands

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm dev            # http://localhost:8080/control
pnpm mcp:smoke      # authenticated MCP probe against a running server
pnpm action seed-demo   # stop dev first (PGlite is single-process)
pnpm build
```

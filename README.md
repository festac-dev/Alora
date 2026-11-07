# Alora — verified mission control for regulated work

Alora is an agent-native mission control for cross-border shipping. You state an
outcome, a team of agents builds the customs package, an auditor challenges it,
and a verifier recomputes the money with deterministic checks. Nothing counts as
done until the deliverable's exact bytes are hashed with SHA-256 and a human
approves that hash. Every action is attributed and appended to a hash-chained
ledger.

**Agents execute. Auditors challenge. Verifiers prove. Humans authorize. The
ledger remembers.**

---

## Why this matters

Regulated work is not a chat problem. A plausible-looking invoice is worthless
if the VAT is €4.20 wrong, if nobody can prove which tariff version was used, or
if the document changed after approval. Alora makes the proof the product:

- arithmetic is recomputed, never trusted;
- HS classification is shown as a confidence and requires human confirmation;
- every rate carries a source, version, URL and fetch date;
- approval is bound to one immutable SHA-256;
- tampering revokes the approval and returns the claim to verification;
- the ledger records the caller (`ui`, `agent`, `mcp`, `cli`, `job`, `seed`) and
  an inverse action for every mutation.

## The flagship workflow

1. Create or intake a shipment.
2. Architect writes acceptance criteria and tasks.
3. Builder classifies items, computes duty/VAT/landed cost from a frozen tariff
   snapshot, and submits a versioned customs package.
4. Auditor adversarially searches for unsupported totals and tariff gaps.
5. Verifier re-hashes the stored bytes and independently recomputes every line,
   total, customs value and landed cost.
6. A human approves the exact verified hash.
7. Fork to another destination and recompute against that jurisdiction's table.
8. Tamper with the bytes and watch the approval revoke.
9. Rewind with compensating ledger events; history is preserved.
10. Export a manifest with every hash and the final ledger tip.

## Why agent-native

Every capability is a `defineAction()` in `actions/`. The same implementation is
callable from:

- the React UI via `useActionQuery` / `useActionMutation`;
- the in-app agent as a tool;
- HTTP at `/_agent-native/actions/<name>`;
- the CLI (`pnpm action <name>`);
- MCP at `/mcp` and A2A.

There is no separate agent backend and no second business-logic layer. The
approval gate lives inside `approve-deliverable`, so every surface inherits the
same server-side checks.

## Architecture

```text
┌──────────────────────────── UI ────────────────────────────┐
│ /control  Shipment canvas · Evidence room · Replay ·       │
│           Agent universe · Extensions                      │
└───────────────┬────────────────────────────────────────────┘
                │ useActionQuery / useActionMutation
┌───────────────▼────────────────────────────────────────────┐
│ actions/  one defineAction per capability                  │
│  create-shipment   architect-plan   builder-classify       │
│  auditor-review    verifier-check   approve-deliverable    │
│  repair-deliverable tamper-deliverable fork-shipment       │
│  rewind-shipment   export-shipment  verify-evidence-chain  │
│  intake-shipment   draft-courier-email ...                 │
└───────┬──────────────────────┬─────────────────────────────┘
        │ domain functions     │ caller + actor from ctx
┌───────▼──────────────┐ ┌─────▼─────────────────────────────┐
│ server/lib           │ │ server/lib/ledger.ts               │
│ document · verification│ │ SHA256(prevHash + canonicalJSON) │
│ auditor · policy     │ │ serialized appends, inverse names  │
└───────┬──────────────┘ └─────┬─────────────────────────────┘
        │ Drizzle              │
┌───────▼──────────────────────▼─────────────────────────────┐
│ PostgreSQL (PGlite locally)                                │
│ shipments · items · claims · deliverables · approvals      │
│ verification_runs · evidence · ledger · tariff_rows        │
│ agents · missions · tasks · courier_drafts · proposals     │
└────────────────────────────────────────────────────────────┘
```

## Agent responsibilities

| Agent         | Action                               | Can do                                              | Cannot do                |
| ------------- | ------------------------------------ | --------------------------------------------------- | ------------------------ |
| Architect     | `architect-plan`                     | criteria, budget, deadline, tasks                   | approve                  |
| Builder       | `builder-classify`                   | classify, calculate, build documents, submit a hash | verify or approve        |
| Auditor       | `auditor-review`                     | challenge totals, flag gaps, write findings         | move a claim to verified |
| Verifier      | `verifier-check`                     | re-hash, recompute, record evidence                 | approve                  |
| Country desks | `spawn-specialist` / `fork-shipment` | jurisdiction-specific rebuilds                      | approve                  |

Only a human identity can call `approve-deliverable`, and even then the action
rejects any identity that exists in the `agents` table.

## Cryptographic integrity

- Deliverable bytes are stored exactly as submitted and hashed with Node
  `crypto` SHA-256.
- The verifier re-reads the stored bytes and recomputes the hash before any
  business check.
- Approval stores `approved_sha256` and the passing verification run id. Current
  verification also binds source inputs and policy version to its ledger event.
- Ledger entries are `SHA256(previousHash + canonicalJSON(entry))`, with object
  keys sorted recursively.
- Version 2 exports include all historical bytes, proof/approval bindings, source
  inputs, tariff citations and the full ledger. The checker rejects missing
  evidence and reports unapproved exports as incomplete.

Unit, real-database and UI tests cover arithmetic, provenance, rollback, approval
and rewind, manifest substitution, and late responses after shipment changes.

## Database

Drizzle over PostgreSQL. Local development uses PGlite
(`DATABASE_URL=pglite:./data/pglite`); a hosted PostgreSQL URL is required for
durable deployment. See `server/db/schema.ts` and the migrations in
`server/plugins/db.ts`.

All domain mutations lock `alora_ledger_head` and commit their state, evidence
and ledger entries together. PostgreSQL processes share that lock; PGlite still
needs one owning process. Bundle/export reads use a consistent snapshot.

For an existing database, stop the old app before migration 5. It preserves old
bytes and evidence, leaves legacy proofs at policy version 1, and requires new
verification before approval. Duplicate versions or active records stop the
upgrade with a reconciliation message rather than rewriting history.

Money is computed in decimal-ish floats with deterministic cent rounding. Tariff
rates and money values are stored as `double precision`; production hardening
would move money to integer minor units.

## MCP

The framework mounts `/mcp` and exposes app actions as tools. The catalog is
scoped: external agents get the read and build surface (`create-shipment`,
`architect-plan`, `builder-classify`, `auditor-review`, `verifier-check`,
`repair-deliverable`, `fork-shipment`, `rewind-shipment`,
`verify-evidence-chain`, `export-shipment`, `list-shipments`, `get-shipment`,
`intake-shipment`). The human gates are deliberately absent from that catalog:
`approve-deliverable`, `approve-proposed-action`, `review-proposed-action`,
`approve-courier-draft` and `sign-off`-style actions never appear as agent
tools, so an external client cannot even attempt an approval. The action still
refuses agent callers if someone reaches it another way.

`ctx.caller` is mapped to the ledger caller (`mcp` for MCP, `tool` → `agent`,
`frontend` → `ui`).

**Verified here with an authenticated session** (`scripts/mcp-smoke.mjs`
against a running server with a static bearer token). The probe creates a
shipment, builds and verifies its package, re-checks the chain, exports a
manifest and confirms the ledger caller is `mcp`. One run:

```text
PASS initialize: Alora 1.0.0
PASS tools/list: 21 tools including create-shipment, no approval tool
PASS tools/call create-shipment: ALO-DE-DF3D24
PASS ledger attribution: 1 entry, latest #48 createShipment caller=mcp actor=operator@alora.local
PASS approval refusal: approve-deliverable was refused ({"content":[{"type":"text","text":"Unknown tool: approve-deliverable"}],"isError":true}) and no approval was recorded
PASS tools/call builder-classify: v1 255215bb25d8a999…
PASS tools/call verifier-check: verified with passing deterministic checks
PASS tools/call verify-evidence-chain: 3 entries, 1 deliverable hashes match
PASS tools/call export-shipment: manifest returned with file and ledger hashes
```

Shipment references and ledger ids differ on every run; the assertions do not. A
transport failure is not a refusal: only a JSON-RPC error or an `isError` result
that names the refusal passes, and any other error fails the probe.

The probe performs the standard Streamable HTTP handshake
(`initialize` → `initialized` → `tools/list` → `tools/call`) with
`Authorization: Bearer <token>`, then creates, builds, verifies, chain-checks
and exports a shipment. It asserts the ledger row is tagged `mcp`, the ledger
chain is valid and an approval attempt is refused. Run it with `pnpm mcp:smoke`
while the server is up and shares the token. Any Streamable HTTP host (Claude
Desktop, Claude Code, another agent) sends the same requests.

A static bearer token has no person behind it, so the ledger actor is the
workspace default. An OAuth-connected client carries the person's identity
instead.

## Tariff provenance

Frozen snapshots live in `data/tariff/{DE,US,AE}.json`. Every row has
`source`, `sourceVersion`, `sourceUrl`, `effectiveFrom`, `fetchedAt` and
`datasetVersion`.

- **DE:** EU TARIC consultation, German import VAT standard rate (19%).
- **US:** USITC HTS 2026 Basic Edition general (Column 1) rates. The US has no
  federal import VAT; state sales/use tax is not modelled.
- **AE:** Dubai Customs / GCC tariff snapshot and UAE VAT standard rate (5%).
  Stored at the 8-digit GCC/HS base, which is marked `GCC/HS 8-digit base` in
  the row and carries `nationalSuffixUnconfirmed: true`. The verifier adds a
  `tariff-line-level` **warning** for those lines: the package can still be
  verified, but nothing implies full tariff-line accuracy until the national
  12-digit suffix is confirmed in Dubai Customs before declaration. Approval is
  blocked until a human ticks the base-level acknowledgement; the approval and
  the export manifest record that acknowledgement and the affected codes.

All outputs render: **ESTIMATE — NOT LEGAL ADVICE**, with the source and version.
No rate is invented: if a tariff row is missing, verification fails instead of
assuming zero. A row never claims more precision than its source published:
`codeLevel` records that level and `nationalSuffixUnconfirmed` records where a
national suffix still has to be checked.

## Security boundaries

- Agents cannot approve their own or anyone else's work.
- Approval requires the current passing proof for the exact bytes and source
  inputs, under the current verification policy.
- Approval of base-level GCC/HS rows requires an explicit acknowledgement.
- Approval is refused and revoked if bytes change or a new version supersedes it.
- MCP/HTTP callers cannot bypass the approval action because the checks are
  inside `run()`.
- Tables do not store credentials; no secrets are committed.
- Intake and order data are validated with Zod at the action boundary.
- This is a single-tenant demo workspace. It does not yet implement per-user
  tenancy, passkeys, sanctions screening or a public verification portal.

See `SECURITY.md` for the full boundary list.

## Run locally

Requirements: Node 22.22+, pnpm 10.

```bash
pnpm install
# .env
DATABASE_URL=pglite:./data/pglite
pnpm dev
```

Open <http://localhost:8080> for the public introduction, or
<http://localhost:8080/control> for the workspace. Shipment, Evidence, Replay,
Agents, and Extensions also have direct `/control/<view>` routes. See
`WALKTHROUGH.md` for the page inventory.

Seed the flagship shipment from the UI (**Reset demo**) or:

```bash
# stop pnpm dev first: PGlite is a single-process database
pnpm action seed-demo
pnpm dev
```

`seed-demo` resets the workspace, installs the tariff snapshots, creates
`DE-2026-001`, plants a €4.20 VAT under-declaration, has the Auditor flag it,
and lets the Verifier reject it.

## Tests and checks

```bash
pnpm test        # unit, PGlite integration, manifest and UI regression tests
pnpm typecheck   # TypeScript strict
pnpm build       # production build
pnpm agent-native:doctor
pnpm mcp:smoke   # authenticated MCP session against a running server
```

There is no lint script in this scaffold. Formatting is handled by `oxfmt`
config if desired. TypeScript 6.0.3 is pinned for reliable module resolution on
Termux. The standard `pnpm typecheck` command regenerates the action and route
types before running the strict check.

To exercise independent PostgreSQL processes, create a disposable localhost
database whose name starts with `alora_test_`, then run:

```bash
ALORA_TEST_POSTGRES_URL=postgres://user@127.0.0.1:5432/alora_test_concurrency \
  pnpm exec vitest run server/lib/postgres-concurrency.test.ts
```

The test resets that database. It refuses non-local hosts or other database names.
It checks concurrent creation, version numbering, duplicate approval, and an
approval/tamper race using separate connection pools.

Check an export with Node 22.22+ and this repository's installed dependencies:

```bash
pnpm verify:manifest manifest.json
# If a ledger tip was retained independently:
pnpm verify:manifest manifest.json --expected-tip <sha256>
```

Exit 0 means an effective approval validated, 2 means consistent but incomplete
evidence, and 1 means invalid evidence. Historical mismatches are reported
separately. The hash chain is not a signature; a retained tip is needed to
detect a completely rewritten chain.

## Judge walkthrough — do X, see Y

| Do                                                                | See                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Open `/control` and click **Reset demo**                          | DE-2026-001 appears with a red **Verification failed** badge and the failing check `vat-total`                                                                                                                                                                          |
| Open **Evidence**                                                 | The deliverable SHA-256, input hash, tariff set, failing recomputation and auditor finding                                                                                                                                                                              |
| Click **Repair package**, then **Verify**                         | A new immutable version v2 and a verified claim                                                                                                                                                                                                                         |
| Click **Approve hash**                                            | Approval bound to the v2 SHA-256; claim becomes `human-approved`                                                                                                                                                                                                        |
| Click **Tamper bytes**                                            | Red hash-mismatch banner, approval revoked, claim back to submitted                                                                                                                                                                                                     |
| Fork to **US** and **AE**                                         | New shipments with different landed costs and destination-specific sources; US/AE desks appear in **Agents**. The UAE fork shows `GCC/HS 8-digit base` and a `tariff-line-level` warning; **Approve hash** stays disabled until you acknowledge the base-level estimate |
| Open **Replay** and click **Rewind to here**                      | Compensations appended, historical rows retained, current proof cleared and approvals revoked; restored bytes need verification                                                                                                                                         |
| Open **Evidence** → **Recompute chain**, then **Export manifest** | Current integrity and historical mismatches reported separately; version 2 manifest includes proof bindings and the final ledger hash                                                                                                                                   |
| Open **Extensions**                                               | Deterministic text intake, self-heal, surge checkers, courier drafts, a proposal you review and then activate, ledger-derived demo script                                                                                                                               |
| Open **Help**                                                     | The tour replays, and the workspace constraints are listed                                                                                                                                                                                                              |

## Deployment

Development mode can run locally against PGlite. The built Node server uses a
persistent PostgreSQL `DATABASE_URL`, including for localhost review. No hosting
provider is required. For a production release, run `pnpm migrate:production`
before starting the server.

```bash
# staging checklist
DATABASE_URL=postgres://… pnpm build
DATABASE_URL=postgres://… pnpm migrate:production
DATABASE_URL=postgres://… pnpm start
ACCESS_TOKEN=<token> pnpm mcp:smoke https://<staging-host>
```

**No staging URL exists yet.** This workspace has no hosting credentials, so no
public deployment was made and the authenticated MCP session was run against a
locally hosted instance. Once a URL exists, rerun `pnpm mcp:smoke` against it;
nothing else in the approval path depends on the host.

## Hard constraints

These are limits of the current build, not bugs to work around:

- **Single-tenant.** There is no per-user authorization or row scoping. Every
  authenticated operator sees the whole workspace. Lifting this needs tenant ids
  on every table, scoped queries and tenant-scoped keys — a schema change, not a
  setting.
- **Domain writes share a global database lock.** PostgreSQL processes serialize
  through the same ledger head. This favors consistency over write throughput;
  it does not remove PGlite's single-process requirement.
- **UAE tariff rows stop at the 8-digit GCC/HS base.** The rows are flagged, the
  verifier warns and the manifest records it. The national 12-digit suffix is
  not looked up; confirm it with Dubai Customs before declaring. Approval
  requires an explicit human acknowledgement while the suffix is unconfirmed,
  and that acknowledgement is stored with the approval. A follow-up migration
  backfills existing rows from the bundled snapshot, so an in-place upgrade
  does not report them as fully confirmed.
- **Capabilities activate only from a reviewed template.** The review binds the
  SHA-256 of the stored code and activation refuses if the template changed
  afterwards. There is no sandbox for generated code, so no generated code runs.

The doctor guard records the unscoped tables as reviewed exceptions in
`agent-native.json` (`doctor.dbToolScopingDenylist`) so the constraint is
checkable rather than implicit. `pnpm agent-native:doctor` reports no findings.

## Known limitations

- **Approval binds to the authenticated operator.** The action rejects agent,
  MCP and background surfaces, requires an authenticated `ctx.userEmail`, and
  refuses any `approverId` assertion that differs from it. In local dev the
  operator is the dev session identity.
- **Intake is deterministic text intake.** Pasted lines are parsed by rules; no
  image model is called and no image bytes are stored in SQL. Unparsed lines are
  returned for correction instead of being guessed.
- **Extension is template-based.** A human reviews the stored template, then
  activates it; a fixed implementation is what runs. Nothing is generated at
  runtime.
- **Forks keep the source currency** unless a caller passes one explicitly.
- **Not shipped:** passkeys, public `/verify` + QR, sanctions screening, tariff
  automations, Merkle/PDF certificates. They are design directions, not claims.
- **CLI database/action commands require `pnpm dev` to be stopped** because
  PGlite is a single-process database.

## Action surface

| Action                                                                                      | Purpose                                                           |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `list-shipments`, `get-shipment`, `get-operator`                                            | Read the control room, evidence bundle and authenticated operator |
| `create-shipment`                                                                           | Create a shipment (UI, agent, HTTP, MCP)                          |
| `architect-plan`                                                                            | Mission, criteria, tasks                                          |
| `builder-classify`                                                                          | Classify, calculate, submit a versioned package                   |
| `auditor-review`                                                                            | Adversarial findings                                              |
| `verifier-check`                                                                            | Deterministic checks and evidence                                 |
| `approve-deliverable`                                                                       | Human-only approval bound to a hash and authenticated operator    |
| `repair-deliverable`, `self-heal-document`                                                  | New immutable version, approval invalidated                       |
| `tamper-deliverable`                                                                        | Integrity probe that revokes approval                             |
| `fork-shipment`, `spawn-specialist`                                                         | Destination recalculation and country desks                       |
| `rewind-shipment`                                                                           | Compensating events, history preserved                            |
| `verify-evidence-chain`, `export-shipment`                                                  | Independent proof and manifest                                    |
| `intake-shipment`                                                                           | Deterministic text intake with human confirmation                 |
| `draft-courier-email`, `approve-courier-draft`, `send-courier-email`                        | Approval-gated outreach                                           |
| `propose-action`, `review-proposed-action`, `approve-proposed-action`, `check-arabic-label` | Template review gate, then activation                             |
| `surge-verify`, `generate-demo`, `seed-demo`                                                | Parallel checkers, ledger-derived demo, reset                     |

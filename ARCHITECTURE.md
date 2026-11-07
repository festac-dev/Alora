# Alora architecture

## One contract, every surface

```text
actions/*.ts
  defineAction({
    description, schema (Zod), outputSchema (Zod),
    run(args, ctx) → domain function
  })
        │
        ├── React: useActionQuery / useActionMutation
        ├── Agent: tool list (ctx.caller = "tool")
        ├── HTTP: /_agent-native/actions/<name>
        ├── CLI: pnpm action <name>
        ├── MCP: /mcp (ctx.caller = "mcp")
        └── A2A
```

No action calls a parallel REST API. The UI never writes business data
directly. `ctx.caller` is normalized by `callerFor()` in
`server/lib/ledger.ts` and stored on every ledger entry.

## Layers

| Layer        | Files                                                                      | Responsibility                                                              |
| ------------ | -------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Presentation | `app/components/alora/*`, `app/routes/control.tsx`                         | Shipment, Evidence, Replay, Agents, Extensions                              |
| Actions      | `actions/*.ts`                                                             | Input/output validation, user-facing errors, provenance                     |
| Domain       | `server/lib/document.ts`, `verification.ts`, `auditor.ts`, `policy.ts`     | Deterministic calculation, checks, approval policy                          |
| Integrity    | `server/lib/hash.ts`, `ledger.ts`, `transactions.ts`, `shared/manifest.ts` | Canonical JSON, SHA-256, atomic ledger writes and exported proof validation |
| Persistence  | `server/db/*`, `server/plugins/db.ts`                                      | Drizzle schema and additive migrations                                      |

## Claim lifecycle

```text
claimed → submitted → verified → human-approved
                    ↘ (rejected run keeps status submitted)
human-approved + byte change → approval revoked → submitted
repair → new immutable version → submitted → verified → new approval
```

`claims` points at the current deliverable and the latest verification attempt.
`claim-lifecycle.ts` defines conditional state transitions. `deliverables` is append-only in
practice: a new build supersedes the old row and creates version N+1.
`verification_runs` are immutable evidence. `approvals` bind a human identity,
a deliverable id, the passing run id and the exact SHA-256. Each new run records
the verification policy version, the actual byte hash and a fingerprint of the
source shipment/items. Rechecking an unchanged approved artifact preserves its
approval. Rebuild, tamper and rewind clear the current proof pointer.

Rewind retains all historical rows, retracts newer versions and restores the
artifact recorded at the target if its bytes still match. Otherwise it leaves
no active artifact. It revokes every active approval and requires fresh
verification; a revoked approval is never restored. Repeating the same rewind
without intervening work is a no-op.

## Deterministic calculation

- Goods = Σ quantity × unit value.
- CIF charges are allocated pro rata by line value.
- Customs value = line total + allocated freight/insurance.
- Duty = customs value × tariff duty rate.
- VAT = (customs value + duty) × tariff VAT rate.
- Landed cost = customs value + duty + VAT.
- Recomputed money is rounded to cents and compared to the declared amount.
- Tariff rates are compared exactly, without money rounding.

The verifier hashes and parses the stored bytes with a strict schema, binds
invoice and packing lines to the SQL source items, and recomputes each step
from quantities, prices and the precisely cited tariff version. It rejects
missing or ambiguous tariff versions. A detached parsed object cannot replace
the stored bytes. The auditor writes separate adversarial findings.

## Ledger

Every domain mutation and its evidence/ledger rows share one transaction:

```text
payload   = canonicalJSON({ shipmentId, actionName, caller, actor,
                            inverseAction, createdAt, data })
entryHash = SHA256(prevHash + payload)
```

`withMutation` locks the singleton `alora_ledger_head` row before domain work.
The lock serializes writers across PostgreSQL processes. Nested commands reuse
Core's transaction context; the append advances the head in the same commit.
Ordinary failures roll back state, evidence and ledger together. An intentional
approval refusal can commit its compensating revocation before returning an
error. Demo reset and reseeding also form one transaction.

Verification walks the global chain from `GENESIS` and checks that duplicated
row metadata agrees with the hashed payload. IDs increase but need not be
contiguous after rolled-back inserts. Bundle and export reads use a repeatable
read snapshot. PGlite still requires a single owning process.

## Approval invariant

`server/lib/policy.ts` is the single approval policy used by
`approve-deliverable`:

1. the caller is an authenticated human surface, identity matches the session,
   and the id is not a recorded agent;
2. stored bytes hash equals the submitted digest;
3. the deliverable is the claim's current artifact;
4. the current proof passed under the current policy and matches the bytes,
   source inputs and its ledger record;
5. if any line cites a base-level GCC/HS row, a human acknowledged that the
   national suffix is unconfirmed;
6. a fresh deterministic check still matches the recorded evidence;
7. repeated approval validates the existing approval's own proof and stored
   consent before returning the same binding.

A new immutable version supersedes the prior deliverable and revokes any active
approval on it; the revoked row and reason stay in the history.

Any failure is a caller-readable error. Invalid existing bytes, source inputs,
proof or consent revoke the approval and return the claim to verification.

## Template review gate

A proposed capability starts as `pending`. `review-proposed-action` records the
reviewing human and the SHA-256 of the stored template code. Activation calls
`evaluateTemplateReview` in `server/lib/policy.ts`, which requires the proposal
to be in `reviewed` state **and** the stored code to still hash to the reviewed
digest. A template edited after review is refused until it is reviewed again.
Nothing is generated or loaded at runtime; the reviewed implementation is fixed
in the repository.

## Tariff provenance levels

Every tariff row records `codeLevel` (what its cited source publishes) and
`nationalSuffixUnconfirmed` (the national suffix still needs confirmation).
UAE rows are `GCC/HS 8-digit base` with the flag set, so the verifier emits a
`tariff-line-level` warning instead of implying a full national tariff line.
Approval then requires an explicit acknowledgement, stored on the approval with
the affected codes. Requirements come from trusted cited rows, including for
legacy documents without flags. Document flags cannot waive acknowledgement.

## Exported proof

Manifest version 2 uses `shared/manifest.ts` for a strict contract shared by
the action and `scripts/verify-manifest.mjs`. It includes source inputs, all
historical bytes, runs and approvals, current pointers, and the complete global
ledger. Validation binds documents to submissions, checks to evidence hashes,
and approvals to passing runs and recorded human consent. It recomputes the
current package against the bundled tariff versions. Draft and unapproved
exports report `incomplete`; historical tamper evidence remains visible.

The hash chain records consistency and caller attribution, not a digital
signature. An independently retained tip can be supplied with `--expected-tip`
to detect a rewritten or truncated chain.

## Data model

`shipments`, `items`, `tariff_rows`, `agents`, `missions`, `tasks`, `claims`,
`deliverables`, `approvals`, `verification_runs`, `evidence`, `ledger`,
`proposed_actions`, `courier_drafts`, `alora_ledger_head`.

See `server/db/schema.ts`. Migrations are additive and named in
`server/plugins/db.ts`.
Migration 5 preserves legacy proofs at policy version 1 and leaves their current
proof pointers empty. It checks for duplicate versions/active rows before adding
constraints; ambiguous data must be reconciled before retrying the upgrade.

## UI surfaces

- **Shipment Canvas:** shipment facts, line items, HS confidence, landed cost,
  failing checks, cryptographic state, tariff sources, controls.
- **Evidence Room:** chain validity, recomputed hashes, verification checks,
  approvals, evidence log, canonical document behind Advanced.
- **Replay:** attributed ledger timeline with inverse actions and rewind-to-here.
- **Agents:** SVG relationship graph plus ledger-derived trust table.
- **Extensions:** deterministic text intake, self-heal, surge, outreach,
  template review then activation, self-demo.

The shell follows the design contract in `DESIGN.md`: neutral dark surfaces,
one accent, no gradients or glows, motion only for state changes, a short tour
on first visit that reopens from Help.
Integrity query results are scoped to shipment, artifact, byte hash, input
fingerprint, verification, approval and ledger tip. Starting a mutation clears
the result; responses for an older scope cannot replace the current display.

## Deliberate non-goals

No second backend, no separate agent runtime, no model call inside deterministic
actions, no arbitrary code execution from agent output, no fabricated tariff
rates.

# Alora walkthrough

Alora is a customs-work mission control, independent of Valor and Halo. Its core value is a package whose source inputs, calculations, exact bytes, verification, and human approval can be inspected together.

## Journey

Create or intake a shipment, plan the work, build a versioned package, audit it, and run deterministic verification. The authenticated operator can approve the verified hash. Repair creates a new version; tampering or rewind revokes approval. Export includes historical evidence and the ledger chain.

The seeded workflow intentionally contains a €4.20 VAT discrepancy. Repair and verify it before approval. Never reset a workspace containing data you need to keep.

## Screens

| Route | Purpose |
| --- | --- |
| `/` | Public introduction, workflow, scope, logo download |
| `/control` | Existing workspace entry; shipment view |
| `/control/shipments` | Shipment details, document building and decisions |
| `/control/evidence` | Hashes, checks, human approval and manifest export |
| `/control/replay` | Attributed history and compensating rewind |
| `/control/agents` | Agent responsibilities and ledger-derived activity |
| `/control/extensions` | Text intake, self-heal, bounded checks and reviewed templates |
| `/chat` | In-app agent surface |
| `/settings` | Existing framework configuration |
| `/home` | Existing shortcut to `/control` |

The persistent control navigation preserves the selected shipment between pages. Phone navigation scrolls horizontally with visible labels. Legacy `/control?tab=...&id=...` links still work. Initial query failure shows a retry instead of an empty shipment list. Existing loading, empty, verification, approval, and error states remain in the domain components.

## Architecture and boundaries

React Router + Agent-Native actions + Drizzle/PostgreSQL, with PGlite for local development. UI, CLI, and agent surfaces share domain actions. The public page does not load authenticated app chrome or start database polling.

This is a single-tenant workspace. Tariffs are frozen selected snapshots, not live global coverage; UAE base rows require explicit acknowledgement. Intake is text-based, courier transport is mocked, and the app does not file declarations or screen sanctions. Monetary arithmetic still uses floating-point values with cent rounding.

The public page explains the workflow with an automatically rotating document stack, a moving verification scan, and flowing evidence paths. It uses no animation controls and honors system reduced-motion settings. The logo is a document with a verification tick. SVG mark, wordmark, and app icons live in `public/`.

## Run and verify

Use Node 22.22+ and pnpm 10. Run `pnpm install`, then `pnpm dev`; the default URL is `http://localhost:8080`. Stop dev before running CLI actions against the same PGlite database. Use the UI to exercise the workflow.

Checks: `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm agent-native:doctor`. PostgreSQL concurrency tests need a disposable localhost database; production configuration needs a persistent database and auth secret. See the README for details.

## Next upgrade priorities

Move authoritative money to integer/decimal representation, establish staging integration evidence, and introduce durable blob storage before larger documents. Broaden tariff coverage only with cited source data. These priorities follow the supplied SKILLS discovery, data-integrity, financial-ledger, AI-governance, and evidence guidance.

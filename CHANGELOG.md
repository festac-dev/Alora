# Changelog

All notable user-facing changes to this app are documented here.

## 2026-11-05

### Changed

- Control panels use one noun title with no eyebrow labels. Long hashes and
  source URLs stay inside their panel, repeated status blocks were removed and
  the header shows only the operator session and Help.
- Verification checks show one line each. The detail and expected/actual values
  appear only for failed or warned checks.
- Toasts, the tour and Help use shorter copy.

### Added

- Approval of a package that cites base-level GCC/HS rows now requires an
  explicit human acknowledgement. The acknowledgement and affected codes are
  stored on the approval, shown in the Evidence Room and included in the export
  manifest.
- The MCP smoke probe now builds, verifies, chain-checks and exports through the
  authenticated session, not just creates a shipment.

### Fixed

- A new immutable version now revokes any active approval on the prior version
  instead of leaving it marked active.
- Re-approving an already approved hash returns the existing binding instead of
  failing because the claim has moved to `human-approved`.
- The approval ledger payload records the authenticated operator rather than an
  optional input assertion.
- The reviewed Arabic-label template now matches the fixed runtime check,
  including the identifier test and the label hash.
- The canvas labels a verified package as awaiting approval, not awaiting
  verification.

## 2026-11-04

### Added

- Alora verified mission control at `/control`: shipment canvas, evidence room,
  mission replay, agent universe and extension lab.
- Agent-Native actions for shipment creation, mission planning, builder,
  auditor, verifier, human approval, repair, tamper detection, fork, rewind,
  export and evidence-chain verification.
- SHA-256 deliverable locking, canonical JSON, a hash-chained ledger with caller
  attribution, and compensating inverse actions.
- Frozen, versioned tariff snapshots for DE, US and AE with cited sources.
- Seeded German shipment with a planted €4.20 VAT under-declaration.
- 46 unit tests for hashing, canonicalization, verification, auditing, the
  approval/rewind policy and base-level tariff acknowledgement.
- Approval is bound to the authenticated operator identity; agent, MCP and
  background surfaces are rejected, not just agent ids.
- Export manifests include the full ledger payloads and document bytes, plus a
  `pnpm verify:manifest` checker.

### Changed

- The app no longer ships the Chat scaffold's home page; `/` and `/home` redirect
  to `/control`.
- Removed the unused `node-pty` dependency so installs do not require a C
  toolchain.

## 2026-10-10

### Fixed

- Large prompts with full context remain available to retry when sending fails.

## 2026-09-30

### Improved

- Chat uses a compact + menu with context submenus, keeps task, automation, and skill actions at the root, and omits Generate Image.

## 2026-09-27

### Fixed

- Chat retries the original request with its attachments after model setup.

## 2026-08-27

### Fixed

- Chat includes the runtime packages needed for provider keys after deployment.

For the full list of updates, see the [changelog folder](./changelog/).

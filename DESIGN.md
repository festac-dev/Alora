# Visual design contract

The public landing page is `/`. Two working surfaces use the app shell:
`/control` (mission control and its dedicated subpages) and
`/chat` (the conversation workbench). This file is the written UI/UX contract
and records the decisions taken so a later change can see what was intentional.

## Public introduction

The landing page uses the control palette and Inter, with larger type and space
for an introduction to the customs workflow. A document-and-check logo identifies
Alora independently. The document preview is explicitly illustrative; it never
claims a real approval. Links open real workspace routes. The public surface
does not load app navigation, start database polling, or hide content behind motion.

Mission control now has direct `/control/shipments`, `/control/evidence`,
`/control/replay`, `/control/agents`, and `/control/extensions` URLs. The sidebar
preserves shipment context, exposes the current page, and becomes a horizontally
scrolling strip with visible labels on phones. Existing `tab` query links remain valid.

## Surface 1 — Alora control (`/control`)

### Design decisions

- **Mode:** operate. Dense, information-first, no marketing sections.
- **Palette:** neutral dark with one accent. Semantic status colours
  (`ok`/`warn`/`danger`) appear only on state, never as decoration.
- **Type:** Inter for UI text, the system monospace stack for hashes, ledger ids
  and identifiers. Two families, two weights.
- **Shape:** 4px radius, 1px hairlines, no shadows.
- **Motion:** state changes only, 120ms on colour and border. No gradients,
  glows, parallax, floating orbs or scroll effects. `prefers-reduced-motion`
  turns transitions off.
- **Onboarding:** a five-step tour, one line per step, shown once and
  reopenable from Help.

### Tokens

Defined once in `app/global.css` under `.alora-root`:

| Token                                            | Value                             | Use                            |
| ------------------------------------------------ | --------------------------------- | ------------------------------ |
| `--alora-bg`                                     | `#0b0f12`                         | Page base (60%)                |
| `--alora-surface`                                | `#12171b`                         | Panels                         |
| `--alora-raised`                                 | `#161d22`                         | Buttons, inputs, selected rows |
| `--alora-line`                                   | `#243038`                         | Hairlines                      |
| `--alora-text`                                   | `#e9eff3`                         | Primary text (30%)             |
| `--alora-muted`                                  | `#a3b1bb`                         | Secondary text, 7.5:1 on base  |
| `--alora-accent`                                 | `#5fd0dd`                         | The only accent (10%)          |
| `--alora-ok` / `--alora-warn` / `--alora-danger` | `#6fcf97` / `#e0b464` / `#f07585` | Status only                    |

Spacing is the 4/8/12/16/24 scale already used by the components. Body text is
12–13px with 1.5 line height; labels are 10px uppercase monospace.

### Layout rules

- One navigation system: the left rail (top tab strip on phones). The old
  duplicate chip row above the panel content was removed.
- Each panel has one noun title and at most one primary action. No eyebrow
  labels above titles.
- Panels hold data, not explanation. Every panel stays inside its grid track:
  long values truncate with the full value in a `title`, tables and diagrams
  scroll inside their own panel, and no text ever widens the page.
- Raw payloads, canonical JSON and template code sit behind a disclosure
  labelled **Advanced**.
- The header shows status, not setup: operator session and Help. Constraints
  and setup instructions live in Help and the README.

### Copy rules

- Page and panel titles are nouns: Shipment, Evidence, Replay, Agents,
  Extensions. The panel title carries the context; do not repeat the shipment
  reference or status above it.
- Buttons are verb + object, sentence case: Run mission, Approve hash, Export
  manifest, Review template, Activate capability. Repeated row actions are
  icon-only with an `aria-label` and a title.
- Toasts say what happened in one clause: "Verifier rejected: vat-total."
- When a package cites base-level GCC/HS rows, the approval control shows one
  consent checkbox naming the affected codes and the unconfirmed national
  suffix. The approval button stays disabled until it is checked.
- Consent codes come from the server's trusted tariff requirements. Evidence
  results belong to the current shipment and snapshot, clear on mutation, and
  distinguish current integrity from historical mismatches. No active document
  is an empty state, never an "all hashes match" result.
- No instructions under controls, no emoji, no exclamation marks, no developer
  jargon in user-facing text. A sentence appears only when it states a
  constraint the user must accept, such as "Estimate, not legal advice."
- Empty states are one line plus one primary action. A loading or error line
  names the state, not the implementation.
- Status appears once per screen where possible. Do not repeat the same claim,
  risk or hash in the page header, a panel title and a badge.

### Anti-references

Neon glow, gradient hero panels, uppercase monospace everywhere, duplicate tab
rows, decorative telemetry banners, "Configure X in Y" instructions in the app,
raw error dumps in primary text, eyebrow labels above panel titles, paragraphs
under controls that restate the action, and repeated status blocks.

### Motion list

The whole surface uses four state transitions and nothing else:

1. Hover: 120ms background and border change on buttons, nav items and rail rows.
2. Press and busy: disabled/busy styling, no movement.
3. Progress: the self-heal bar transitions width over 150ms after a result.
4. Overlay: the tour and Help dialogs appear without animation.

## Surface 2 — Chat

Chat is a quiet, full-canvas conversation workbench. AgentKit owns the
conversation primitives; the template owns the surrounding navigation and
workspace chrome.

### Product mode

- Mode: `operate`
- Audience and cadence: frequent users managing many ongoing agent threads.
- Primary workflow: begin, resume, pin, and organize conversations without
  leaving the chat canvas.

### Visual direction

- Direction name: Quiet conversation library
- Palette family: neutral ink and semantic surfaces; active rows use the
  existing sidebar accent rather than a separate branded color.
- Type treatment: dense sans-serif labels with regular-weight conversation
  titles and restrained section labels.
- Composition: a persistent conversation library beside a generous chat
  canvas. New chat is the primary rail action, followed by Pinned and Recents.
  Account, workspace, settings, and sign-out controls disclose from one footer
  row instead of competing in the rail.
- Shape language: borderless lists, soft selected rows, quiet corners, and
  compact icon controls.
- Anti-references: icon-only navigation as the default state, floating chips,
  duplicated settings links, timestamps competing with thread titles, and
  placeholder destinations that the app does not implement.

### Guardrails

- Preserve the scaffold's semantic tokens and shared component seams.
- Keep domain pages distinct from full-page chat and use the AgentSidebar for
  contextual AI.
- Compare sibling apps before reusing their palette or composition.
- Keep pinning, rename, archive, and routing wired to the shared chat thread
  model; the sidebar is a presentation layer, not a second history store.

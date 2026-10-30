# Design

## Context

See proposal.md. Shared shadcn buttons are flex containers with fixed heights and nonwrapping anonymous text. Tooltip composition can replace data-slot attributes, so styling actions through that attribute is fragile. Work areas currently render bare empty text and sometimes pagination before a successful collection read. Static public assets require explicit copying into the packaged standalone output.

## Goals / Non-Goals

Make action affordances and genuinely empty areas intentional and usable. Preserve job execution, migration/retry/sync semantics, identity safeguards, confirmations, object outcomes, quality, retryability, run results and exit codes. No real migration, credential/config edits, remote lookup, data deletion, API/schema changes or new dependencies.

## Decisions

- Add explicit optional leading-icon composition to the shared button instead of runtime label guessing or automatic decorative icons on every semantic control. Wrap action labels in a shrinkable span and use a stable CSS class independent of tooltip slot attributes. Audit work-area/form/dialog actions; keep icon-only navigation, pagination and selection controls semantically intact.
- Use the official MIT-licensed Octicons GitHub mark as a local inline SVG with attribution, placed after help/theme/language as the rightmost header control. Preserve native anchor isolation.
- Add a small shared web empty-state composition with five thematic transparent ImageGen PNGs (connections, reports, tasks, synchronization, mentions/hashtags). Use concise local copy and existing actions. Do not reuse a generic error panel or imply successful migration. Keep illustrations decorative and load only local assets.
- Track successful collection loading explicitly. Keep loading and failures separate, hide pagination for zero collections and distinguish filtered no-results from empty workspaces. Preserve corrupt-report diagnostics and invalid-configuration repair; empty-state actions open existing forms or navigation rather than mutate providers.
- Copy tracked web public assets into standalone output and verify installed-package delivery. Avoid CDN images and optimizer/server dependencies by using local unoptimized images.
- Verify computed button geometry, left-icon order, text containment and no overflow across RU/EN, themes, sidebar states, narrow viewports and dialogs. Review macOS/Linux visual changes at existing thresholds rather than broadening tolerances. Update the canonical README UI paragraph only.

## Risks / Trade-offs

- Generated assets can be visually inconsistent or opaque: inspect every PNG, verify alpha and local light/dark/mobile rendering; retain short text guidance if decorative images fail to load.
- Shared button layout affects offline editors/reports: preserve asChild and icon-only behavior, run the entire browser/package suite and avoid changing semantic selectors.
- Async collection reads can race: guard stale responses where touched and keep explicit failure evidence; never turn a failed read into an empty successful collection.
- Extra icons can add noise: only decorate text actions, keep familiar icon-only controls and avoid adding icons to every option or data cell.

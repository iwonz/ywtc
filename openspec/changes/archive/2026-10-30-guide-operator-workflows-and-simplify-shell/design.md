# Design

## Context

See proposal.md. Existing shadcn field compositions accept descriptions but do not consistently link them or show required markers. Core job/progress data already separates lifecycle, migration results and outcomes; the UI should explain that evidence rather than extend its producers.

## Goals / Non-Goals

Make configuration-to-execution workflows discoverable and keep the shell lightweight. No new provider operations, status assignment rules, state identities, CLI/configuration fields, remote user lookup, forced migration or destructive action. Retry, resume and ownership safeguards remain authoritative in existing services.

## Decisions

- Keep workspace controls in the sidebar and order connections, migrations/reports, tasks, synchronization and mentions/hashtags. Open connections first; selecting/creating another workspace clears old run/job context. Persist only sidebar expansion in safe local storage. Collapsed controls retain names, tooltips and keyboard access; workspace selection can expand/focus its existing control.
- Keep shadcn primitives and semantic fieldsets. Compose required markers, visible descriptions and focus/hover information buttons without interactive children inside labels. Scope uses described radio choices shared by migration and source-only analysis; source-status guidance covers page/space roots. Advanced overrides follow required source/destination fields.
- Keep form errors visible inside the active dialog rather than relying solely on a page-level alert behind it. Staging a repair draft remains distinct from validating/applying configuration or executing a provider operation.
- Explain configuration schema requirements separately from credentials needed for provider calls. Preserve hidden credential reuse and validated repair. Migration submit validates prerequisites and clears live confirmation whenever request parameters change; the server remains the validation/mutation boundary.
- Add an offline help dialog with workflow and concise status sections. README remains the exhaustive producer/condition reference; help distinguishes lifecycle, run results, object outcomes, quality and retryability without inventing new vocabulary.
- Derive task guidance from exact known progress phases and lifecycle states; unknown phases retain their raw evidence with neutral guidance. No fake totals or stage completion. Do not change SSE, stop, queue or heartbeat semantics.
- Offer dry-run-to-live continuation only for normal error-free run results (completed or completed-with-warnings); other results require reviewing issues and a new analysis. This does not change core outcomes or CLI retry rules.
- Remove decorative section/header/sidebar separators, retain input outlines, meaningful selection/problem treatment, modal/preview boundaries and focus indicators. GitHub and eligible report reference icons use native isolated HTTP(S) anchors rather than button href attributes or prefetched application routes; unavailable links remain disabled.

## Risks / Trade-offs

- Long descriptions can overwhelm forms; show short scope text inline, advanced details on demand, and one status help entry point.
- Collapsed navigation can obscure context; keep accessible names and a workspace expansion/focus action, and test mobile plus both themes.
- Guidance could drift from core semantics; verify scope/status/option descriptions against current CLI, progress, config and README contracts and add focused fixtures.
- Intentional layout changes require reviewed macOS/Linux snapshots at existing thresholds. Shared fields must not regress offline report/editors or credential visibility.

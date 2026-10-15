# Proposal

## Why

A real dry-run against an existing state exposed two ambiguous report behaviors: failed staging could be overwritten by stale state outcomes, and degradations were included in the warning total despite being displayed separately. Reports must describe the current run exactly, especially when no destination mutation occurs.

## What Changes

- Preserve the current run's failed or blocked staging outcome instead of restoring a prior state status in dry-run reports.
- Report every dry-run resource as planned and zero transferred bytes, including pages blocked before the content phase.
- Keep warnings and degradations as separate counters in JSON, HTML, terminal output, and `reports list`.
- Continue using both warnings and degradations when deciding whether a successful run completed with attention items.
- Add regression tests for existing-state dry-runs and exact issue-category agreement.
- Keep dry-run mutation-free and leave existing state and destination content unchanged.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `wiki-migration`: clarify that current-run outcomes override historical state in reports and that warning/degradation categories remain disjoint across report views.

## Impact

- Remote migration dry-run status propagation in `src/migrator.ts`.
- Issue summary, catalog, terminal rendering, and tests.
- Existing `wiki-migration` report-accounting requirements.

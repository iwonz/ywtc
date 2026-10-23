# Design

## Context

See proposal.md for motivation. `runMigrationCommand` currently prints all final fields consecutively, with inconsistent label widths. Report access printing is shared with failure and interruption paths.

## Goals / Non-Goals

**Goals:** make the existing information scannable using plain whitespace and aligned values.

**Non-Goals:** new counters, hidden data, decorative panels, output-format dependencies, migration changes, report/state changes, retry-selection changes, or different exit behavior.

## Decisions

- Use a small local field printer with a fixed label width sufficient for `Previous run`. Apply it to final summary fields and shared report access; keep report-bearing failure/interruption fields aligned with those rows.
- Print groups directly, keeping existing value expressions and conditional checks. Place Content, Grid, and inventory-recovery with source inventory; Causes with Quality. Show the optional footer separator only when that footer contains fields.
- Prefer blank lines over additional headings or frames: the user needs less visual density, not more labels.
- Preserve retry/root identities, resume commands, object outcomes, quality categories, and exit codes unchanged. No provider operations or content writes are added.

## Risks / Trade-offs

- Reordering could accidentally omit conditional fields → inspect synthetic ordinary, minimal, and retry summaries, then run the existing full check suite.
- Shared report fields could misalign in failure output → use the same printer for adjacent failure/interruption metadata without changing error handling.

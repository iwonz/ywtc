# Proposal

## Why

The final transfer summary is a dense list of metadata, inventory, outcomes, and diagnostics. Logical spacing and aligned labels make it easier to inspect without removing useful information.

## What Changes

- Group completion output into report access, source inventory, object outcomes, diagnostics, and optional results/continuation.
- Separate nonempty groups with one blank line and align field values.
- Preserve every existing counter, conditional field, report command, retry decision, and exit code.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `wiki-migration`: readable, logically grouped terminal completion summaries.

## Impact

Only terminal presentation in `src/migration-command.ts` and its current specification. No dependencies, configuration, state, report data, migration operations, or destructive actions change.

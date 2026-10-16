# Proposal

## Why

The complete migration flow currently requires operators to compose a long command and manually repeat it after a dry-run. A TTY wizard can make the safe path discoverable while preserving the deterministic, automation-friendly non-interactive CLI.

## What Changes

- Add `ywtc migrate --interactive` and `-i` as a state-machine wizard over the existing migration pipeline.
- Guide workdir, source, destination, scope, comments, optional file archive, review, dry-run, report opening, and explicit live execution while retaining edited values during backward navigation.
- Reuse the interactive initialization wizard when a selected workspace is not ready, without persisting migration choices into configuration.
- Permit live continuation after dry-run only when the dry-run inventory and outcomes contain no blocking condition.
- Add documented unique short aliases to eligible CLI options without changing existing long forms or non-interactive semantics.
- Shorten the README minimum flow to installation, interactive initialization, and interactive migration while retaining concise direct-command examples.
- Preserve dry-run's no-mutation guarantee, existing state identity, report generation, signal exit codes, and the non-destructive destination boundary.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `wiki-migration`: add the TTY migration wizard, conditional endpoint requirements, safe dry-run-to-live handoff, cancellation behavior, and public short aliases.
- `project-maintenance`: make the interactive migration path the documented and packaged minimum workflow and verify its aliases and non-TTY safety.

## Impact

- CLI argument parsing and help, migration command dispatch, shared prompt abstractions, and a new migration wizard module.
- Unit and package smoke tests for parsing, wizard navigation, dry-run/live sequencing, cancellation, and non-TTY behavior.
- Existing README sections only; no new second-level heading.
- No changes to provider APIs, state identity, configuration format, report format, source selection, or destructive-operation boundaries.

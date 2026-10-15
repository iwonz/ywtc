# Proposal

## Why

First-time operators must currently edit a credential-bearing YAML file by hand and only discover connection mistakes later. An opt-in terminal wizard can make the shortest setup path guided, validated, and safe without changing automation-oriented initialization.

## What Changes

- Add `ywtc init --interactive` with a required TTY, staged back/forward navigation, masked credentials, mandatory field validation, and cancellation without partial writes.
- Guide the operator through workdir selection, existing-workspace handling, one Yandex Wiki connection, one Confluence connection, read-only API probes, and a first dry-run example.
- Preserve ordinary `ywtc init`; when editing, preserve unselected profiles and YAML comments, and when resetting, back up the prior configuration without deleting runtime state.
- Commit a validated draft only after both connection probes succeed, using secure permissions, atomic replacement, rollback, and secret-safe diagnostics.
- Document and package the interactive path while preserving the fixed README information architecture.
- Do not test page-specific permissions, create remote content, delete runtime data, or persist source/destination locators.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `workspace-management`: Define the opt-in interactive initialization workflow, connection-only probes, navigation, cancellation, backup, and atomic commit behavior.
- `project-maintenance`: Make the guided setup the shortest documented path and verify its public CLI/package surface.

## Impact

- CLI parsing and initialization orchestration gain an `--interactive` path.
- Workspace/configuration services gain in-memory draft validation, comment-preserving edits, backup, and atomic persistence.
- Yandex Wiki and Confluence clients gain authenticated current-user probes.
- Production dependencies add `@clack/prompts`; tests, README, package validation, and OpenSpec specifications are updated.

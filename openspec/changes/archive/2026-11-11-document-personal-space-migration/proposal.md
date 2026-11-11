# Proposal

## Why

README mentions personal sources only inside the general locator reference, so an operator cannot quickly see the exact Yandex Wiki → Confluence and Confluence → Yandex Wiki commands. A dedicated, compact workflow will make both supported directions copyable while preserving the existing safety model.

## What Changes

- Add one dedicated subsection to the existing README `CLI` section for personal-space migration.
- Show the minimum prerequisite, the exact personal source URL form, the required existing destination parent, a dry-run command, and the corresponding live command for each direction.
- Consolidate personal-source rules in that subsection: `subtree` coverage, generated destination structure, Cloud/Data Center locator forms, API visibility, and excluded settings.
- Extend the README contract check so the dedicated subsection and both directional examples cannot disappear unnoticed.
- Refresh the locked transitive `follow-redirects` version within the existing `axios` range to clear the high-severity audit finding encountered by the mandatory quality gate.
- Do not add CLI options, change provider behavior, copy permissions/settings/profile data, introduce deletion or purge behavior, or add a direct runtime dependency.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `project-maintenance`: require a dedicated, concise, bidirectional personal-space migration workflow in the canonical README and verify its copyable commands.

## Impact

- `README.md`: personal-space operator guidance and examples.
- `scripts/readme-contract.mjs`: documentation contract validation.
- `package-lock.json`: audited transitive dependency resolution only.
- `openspec/specs/project-maintenance/spec.md`: synchronized current documentation requirement after archival.
- No runtime API, configuration, direct-dependency, migration-state, remote mutation, or destructive-operation changes.

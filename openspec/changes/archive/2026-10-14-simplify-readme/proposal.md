## Why

The README contains the required operational information, but repeated explanations and conversational phrasing make it slower to scan. Before further public use, it should present the same contract in a shorter, more neutral, and more structured form.

## What Changes

- Condense repeated explanations in compatibility, setup, CLI input, state, scope, and development sections.
- Use direct, academically neutral language while retaining every operationally significant requirement, command, warning, link, and supported input form.
- Keep token acquisition checklists and the complete CLI option table as the canonical detailed references.
- Do not change CLI behavior, migration behavior, compatibility claims, dependencies, or public APIs.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `project-maintenance`: require concise, non-repetitive public documentation while preserving the existing coverage contract.

## Impact

- Affected files: `README.md` and the project-maintenance documentation requirement.
- No runtime code, generated reports, dependencies, credentials, state, or external content is changed.
- No destructive operations are introduced; the published commit is amended only after all repository checks pass.

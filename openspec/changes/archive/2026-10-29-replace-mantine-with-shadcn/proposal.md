# Proposal

## Why

All operator interfaces should use shadcn/ui consistently. Mantine currently supplies the control center, offline reports and both decision editors, while current specifications still prohibit the requested replacement.

## What Changes

- Replace Mantine components, providers, styles and hooks across every interactive UI with shared local shadcn/ui components and semantic theme tokens.
- Preserve flat layouts, meaningful nonzero metrics, RU/EN, themes, keyboard navigation, virtualization, security and all existing operator workflows.
- Bundle generated CSS, primitives, fonts and assets locally for Next.js and autonomous file-based applications.
- Remove Mantine dependencies and update browser snapshots, package checks and canonical documentation.
- Replace the legacy CSS transitive chain blocking the mandatory production audit with a maintained, API-compatible parser; retain its CommonJS/default-import contract and validate equivalent CSS output.
- Non-goals: migration behavior, CLI options, state/report/decision JSON, provider operations and redesigning exported source content. No real migrations or provider mutations are part of verification.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `project-maintenance`: one shared shadcn component system and regression checks across all interactive surfaces, replacing the obsolete dependency prohibition.
- `hashtag-decisions`: the autonomous editor uses the shared shadcn components while preserving its existing editing contract.

## Impact

`web`, `report-ui`, `mentions-ui`, shared UI sources, frontend build configuration, dependencies, browser tests/snapshots and README. The installed package remains self-contained; ordinary CLI startup does not load frontend libraries.

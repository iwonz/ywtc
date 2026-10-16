# Proposal

## Why

The report visual snapshots pass on macOS but fail in Linux CI because the dashboard falls back to platform-specific system fonts. The published offline report also does not yet satisfy its intended deterministic embedded-font behavior.

## What Changes

- Bundle the Inter variable font, including Latin and Cyrillic subsets, into the single-file report application.
- Make report typography independent of fonts installed on the host operating system.
- Keep the four desktop/mobile and light/dark visual snapshots strict and portable instead of increasing their tolerance.
- Preserve report data, CLI behavior, migration outcomes, and the existing report design.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `project-maintenance`: Require the offline report shell and its visual quality gates to use deterministic self-hosted typography across supported CI platforms.

## Impact

- Affects the report UI entry/CSS, report build dependencies, visual tests, package contents, and project-maintenance specification.
- Adds a build-time Fontsource package whose selected font files are inlined by the existing Vite single-file build.
- Does not fetch fonts at report runtime, change report data, or mutate source/destination systems.

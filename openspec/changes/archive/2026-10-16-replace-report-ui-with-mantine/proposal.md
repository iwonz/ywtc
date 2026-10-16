# Proposal

## Why

The report dashboard currently maintains a custom shadcn-style component layer on top of Radix and Tailwind, while its dense summaries render many zero-value counters that add visual noise. Replacing this stack with Mantine provides a maintained accessible component system and creates a clearer, more utilitarian report without changing the report data contract or offline guarantees.

## What Changes

- Replace the report application's custom shadcn-style primitives, Radix UI, Tailwind CSS, CVA, clsx, and tailwind-merge with current Mantine components and theming.
- Preserve the autonomous `file://` single-HTML report, embedded fonts and illustration, CSP, sandboxed previews, localization, theme cycle, accessibility, virtualization, and responsive behavior.
- Redesign the overview, hierarchy, details modal, filters, status badges, tables, alerts, and preference controls into a compact Mantine interface.
- Hide zero-value counters and empty metric groups wherever their absence is unambiguous; always retain totals, status, progress, and diagnostics required to understand completeness.
- Keep problem states visually prominent while avoiding empty tabs, placeholder rows, duplicated identifiers, and repeated metadata.
- Update browser, visual, package, dependency, and documentation checks for the new component stack.
- Do not change migration outcomes, report JSON, CLI commands, source/destination data, or any remote content.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `project-maintenance`: require a Mantine-based, autonomous report UI with compact zero-suppressed presentation and maintained interaction/accessibility checks.

## Impact

- Report application: `report-ui/src`, Vite report build, browser fixtures and visual baselines.
- Dependencies: add `@mantine/core` and `@mantine/hooks`; remove the report-only Radix/Tailwind/shadcn-support packages.
- Documentation/specification: existing `## Отчёты` README content and project-maintenance requirements.
- Generated report payloads and existing report-opening CLI contracts remain unchanged.

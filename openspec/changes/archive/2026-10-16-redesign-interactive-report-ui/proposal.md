# Proposal

## Why

The current report is a dense static document that makes it difficult to reconcile source inventory with destination outcomes or find the exact page, file, or comment behind a partial or failed run. Operators need an offline, privacy-preserving dashboard that exposes the hierarchy and root causes without changing the report-opening workflow.

## What Changes

- Replace the generated report page with a self-contained React and shadcn/ui dashboard that works directly from `file://` without CDN or runtime network requests.
- Add a source-versus-destination summary, expanded searchable hierarchy, outcome filters, direct source/destination links, and a tabbed per-page detail dialog.
- Include selected and source-status-excluded pages in one report tree and enrich report metadata for resource, comment, hierarchy, and causal issue diagnostics.
- Add Russian and English localization, system/light/dark themes, keyboard accessibility, mobile layouts, and virtualized large trees.
- Generate and package a transparent provider-neutral report header while preserving the existing README header.
- Keep downloadable JSON free of page/comment bodies and keep preview content only inside the local sandboxed HTML report.
- Preserve existing `reports list`, `reports open`, report paths, state identity, and migration behavior. No destination content is deleted or modified by this report-only presentation change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `wiki-migration`: Strengthen the local report contract with reconciled source/destination comparison, excluded-page hierarchy, typed object diagnostics, offline interactivity, localization, theming, and accessible page details.
- `project-maintenance`: Package and validate the generated report application and transparent report asset, and document the dashboard only in the existing Reports section.

## Impact

- Affects the report model/writer, issue metadata, source-selection reporting, report browser tests, packaging validation, and the README Reports section.
- Adds React, shadcn/Radix primitives, Lucide, Tailwind/Vite single-file build tooling, and tree virtualization dependencies.
- Adds a compiled self-contained report shell to `dist` and a generic transparent image asset to the published package.
- Does not change CLI syntax, provider API mutation behavior, state identity, or existing report bundles.

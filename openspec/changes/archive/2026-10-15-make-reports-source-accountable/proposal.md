# Proposal

## Why

Current reports show final page totals but do not clearly separate the accessible source inventory from transfer outcomes. Operators cannot reliably answer how much content was selected, whether every page and resource is accounted for, or which concrete object caused a warning or error.

## What Changes

- Add an explicit source-scope inventory for pages, transferable resources, known and unknown bytes, links, images, tables, grids, and code blocks.
- Add exhaustive page and resource outcome counts whose totals reconcile with the source inventory, including discovered, planned, blocked, conflict, partial, failed, and complete states.
- Record per-resource outcomes and connect every issue to an affected page and resource when that context exists.
- Reorganize the HTML report around source inventory, transfer outcomes, items requiring attention, page hierarchy, resources, link traversal, timing, outputs, and downloadable JSON.
- Make empty graph sections and incomplete discovery explicit instead of presenting missing data as zero successful work.
- Extend report catalog output and automated unit/browser tests so totals, statuses, reasons, and responsive presentation cannot silently drift.
- Keep reports local and credential-free; do not add remote writes, destination deletion, runtime files, or migration-specific data to the repository.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `wiki-migration`: strengthen detailed report auditability so source inventory, exhaustive transfer outcomes, and object-specific problem reasons reconcile across JSON, HTML, and report listings.

## Impact

- Reporting model and renderer in `src/report.ts`.
- Migration inventory/result reporting in `src/migrator.ts`.
- Report catalog and terminal list output.
- Unit, migration, and Playwright report tests.
- Existing README `Отчёты` section and the `wiki-migration` specification.

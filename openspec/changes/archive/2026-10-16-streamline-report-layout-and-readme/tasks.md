# Tasks

## 1. Visual assets

- [x] 1.1 Edit the README header with ImageGen to remove only the small arrows between central content tiles, then verify its original dimensions, dark background, labels, connectors, and composition visually.
- [x] 1.2 Edit the report header with ImageGen to remove only the small arrows between central content tiles, then verify its original dimensions, alpha channel, labels, connectors, and light/dark-theme legibility visually.

## 2. Flat report presentation

- [x] 2.1 Replace overview and hierarchy card surfaces with semantic flat sections and verify no outer Card/Paper island remains in the main report document.
- [x] 2.2 Remove redundant title, direction line, progress UI, visible summary headers, and result button; implement ordered `RUN ID`, `STATE`, `SOURCE`, `DESTINATION` metadata with safe links and verify Run ID is rendered once.
- [x] 2.3 Centralize positive-value summary/detail filtering, required empty states, and empty-category omission; verify unit tests cover zero, unknown, and non-zero values.
- [x] 2.4 Flatten page-definition and technical-diagnostic content inside the retained modal; verify search, filters, status emphasis, virtualized hierarchy, preferences, and keyboard behavior remain available.
- [x] 2.5 Update Playwright assertions and four desktop/mobile light/dark snapshots; verify `file://` operation, RU/EN, source/destination links, modal behavior, and absence of application network requests.

## 3. Concise current documentation

- [x] 3.1 Refine README prose so each rule has one canonical section while preserving the exact thirteen H2 headings, exactly three minimum steps, and exactly four common examples; verify heading/example counts automatically.
- [x] 3.2 Cross-check tables and commands against current CLI/config/package contracts; verify Node/npm requirements, aliases, directions, formats, token flows, state behavior, and transfer statuses remain complete and current.

## 4. Integrated verification

- [x] 4.1 Build the single-file report and run unit plus browser report suites, verifying image packaging, accessibility, safe serialization, and visual snapshots.
- [x] 4.2 Run `npm run check` and package/browser smoke tests, resolving all Biome, Knip, typecheck, test, package, and OpenSpec failures.

## Workflow follow-up

- Archive `streamline-report-layout-and-readme` after implementation verification and run strict OpenSpec validation again.
- Reconcile with `origin/master`, create `fix(reports): streamline report presentation and documentation`, push, and verify the 4.1.1 GitHub/npm/npx/Homebrew release flow.

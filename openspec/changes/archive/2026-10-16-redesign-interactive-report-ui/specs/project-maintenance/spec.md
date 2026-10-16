# Spec Delta

## ADDED Requirements

### Requirement: Packaged report application
The project SHALL compile and package the report dashboard as a self-contained generated asset that the installed CLI can inject with per-run data without depending on repository source files.

#### Scenario: Installed package writes a report
- **WHEN** an isolated installation completes a report-writing smoke test
- **THEN** the package SHALL produce an offline `index.html` with embedded application assets plus a separate sanitized `report.json`

#### Scenario: Report shell integrity is checked
- **WHEN** build or package validation inspects the generated shell
- **THEN** it SHALL find exactly one data-injection marker and SHALL fail rather than emit a partial report when that invariant is violated

### Requirement: Provider-neutral report illustration
The package SHALL include a transparent provider-neutral report illustration that identifies both remote sources, the transferable content classes, and all remote and static destinations without changing the README header.

#### Scenario: Illustration is rendered in either theme
- **WHEN** the dashboard uses light or dark mode on desktop or mobile
- **THEN** the illustration SHALL remain legible, preserve transparency, fit without clipping, and contain no migration-specific organization data

### Requirement: Interactive report quality gates
Project checks SHALL validate report accounting, offline behavior, accessibility, localization, theming, responsive interaction, large-tree behavior, privacy, and package availability.

#### Scenario: Browser suite runs
- **WHEN** the maintained Playwright report suite opens a generated report through `file://`
- **THEN** it SHALL exercise summary reconciliation, hierarchy search/filter/collapse, direct links, dialog tabs, previews, keyboard interaction, Russian and English, light and dark themes, and mobile layout without application network requests

#### Scenario: Privacy suite runs
- **WHEN** report fixtures contain script-like text, unsafe URLs, private previews, tokens, or email addresses
- **THEN** checks SHALL prove active content is isolated and downloadable JSON plus package contents do not expose protected values

### Requirement: Interactive report documentation
The README SHALL describe the current dashboard within `## Отчёты` without changing the fixed second-level section order or duplicating migration status definitions.

#### Scenario: Operator reads report guidance
- **WHEN** an operator reads the Reports section
- **THEN** it SHALL concisely explain the source/destination summary, hierarchy filters, per-page details, comparison, language/theme controls, JSON download, and existing report-opening commands

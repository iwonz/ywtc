# project-maintenance Delta

## ADDED Requirements

### Requirement: Source-authoritative state and report documentation
The README SHALL explain current mapped-object authority and compact report behavior only inside its existing `State` and `Отчёты` sections.

#### Scenario: Mapped destination policy is reviewed
- **WHEN** an operator reads `State`
- **THEN** it SHALL state that current source content and hierarchy replace differing proven mappings through destination version history while unmapped or ambiguously owned objects remain protected

#### Scenario: Conflict status is reviewed
- **WHEN** an operator reads the transfer status tables
- **THEN** `conflict` SHALL mean ambiguous ownership or identity rather than an ordinary destination revision or manual content change

#### Scenario: Report interface is reviewed
- **WHEN** an operator reads `Отчёты`
- **THEN** it SHALL describe the single compact overview, hierarchy diagnostics, per-page problem details, icon-only language/theme controls, JSON download, and existing report-opening commands without a new second-level section

## MODIFIED Requirements

### Requirement: Interactive report quality gates
Project checks SHALL validate compact report accounting, offline behavior, accessibility, localization, theming, responsive interaction, large-tree behavior, privacy, and package availability.

#### Scenario: Browser suite runs
- **WHEN** the maintained Playwright report suite opens a generated report through `file://`
- **THEN** it SHALL exercise the unified overview, absence of removed standalone panels and disclaimer, summary reconciliation, hierarchy search/filter/collapse, direct links, dialog tabs, previews, icon preference cycles, keyboard interaction, Russian and English, light and dark themes, and mobile layout without application network requests

#### Scenario: Preference controls are inspected
- **WHEN** browser checks activate language and theme buttons
- **THEN** tooltips, accessible names, current and next modes, deterministic cycles, and safe storage persistence SHALL be verified

#### Scenario: Privacy suite runs
- **WHEN** report fixtures contain script-like text, unsafe URLs, private previews, tokens, or email addresses
- **THEN** checks SHALL prove active content is isolated and downloadable JSON plus package contents do not expose protected values

### Requirement: Interactive report documentation
The README SHALL describe the current compact dashboard within `## Отчёты` without changing the fixed second-level section order or duplicating migration status definitions.

#### Scenario: Operator reads report guidance
- **WHEN** an operator reads the Reports section
- **THEN** it SHALL concisely explain the unified source/destination overview, quality totals, hierarchy filters, per-page details, comparison, icon language/theme controls, JSON download, and existing report-opening commands


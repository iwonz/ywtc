# project-maintenance Delta

## MODIFIED Requirements

### Requirement: Transfer outcome documentation
The README SHALL define page/file outcomes and the separate normalization, adaptation, degradation, warning, and error quality dimensions inside the existing Reports section.

#### Scenario: Page status is inspected
- **WHEN** an operator reads `### Статусы переноса` under `## Отчёты`
- **THEN** a page-status table SHALL define `complete`, `partial`, `failed`, `blocked`, `conflict`, `planned`, and `not-started`
- **AND** it SHALL state whether destination data was written and the appropriate user action for each status

#### Scenario: File status is inspected
- **WHEN** the operator reads the same subsection
- **THEN** a separate file-status table SHALL define `complete`, `partial`, `failed`, `blocked`, `planned`, and `not-started`
- **AND** it SHALL explain that `planned` is exclusive to dry-run while `blocked` identifies an unmet page dependency

#### Scenario: Quality classification is inspected
- **WHEN** an operator compares complete pages containing normalizations or adaptations with partial pages
- **THEN** documentation SHALL explain that adaptations preserve information in another presentation while degradations identify absent or unverified information

#### Scenario: Failure and dependency are compared
- **WHEN** an operator compares `failed` with `blocked`
- **THEN** the documentation SHALL explain that `failed` means an operation was attempted unsuccessfully while `blocked` means it was intentionally not attempted because an upstream dependency failed or conflicted

#### Scenario: README structure is checked
- **WHEN** the status documentation is updated
- **THEN** the README SHALL retain its exact thirteen second-level headings and SHALL NOT duplicate status definitions in another section

### Requirement: Interactive report documentation
The README SHALL describe the compact dashboard and its distinct information-impact categories within `## Отчёты` without changing the fixed second-level section order.

#### Scenario: Operator reads report guidance
- **WHEN** an operator reads the Reports section
- **THEN** it SHALL concisely explain the unified overview, quality totals for adaptations/degradations/normalizations, hierarchy filters, details, comparison, preference controls, JSON download, and report-opening commands

### Requirement: Content-equivalence documentation
The README supported-content table SHALL distinguish exact preservation, safe normalization, complete static adaptation, and incomplete fallback without adding another second-level section.

#### Scenario: Operator evaluates layout fidelity
- **WHEN** the operator reads `Возможности`
- **THEN** the table SHALL explain native column preservation plus complete responsive HTML and ordered Markdown adaptations when all cells remain available

#### Scenario: Operator evaluates dynamic tables and external media
- **WHEN** the operator compares provider constructs
- **THEN** the table SHALL identify verified Grid snapshots as complete adaptations and unchanged external image URLs as preserved references rather than partial transfers

#### Scenario: Operator evaluates provider constructs
- **WHEN** the operator compares Yandex Wiki and Confluence features
- **THEN** the table SHALL identify supported pairs for notes/callouts, cuts/expand, tree/children, task lists, code, anchors, links, images, and attachments and SHALL keep genuinely incomplete constructs in the concise limitations table

#### Scenario: Empty structural page is documented
- **WHEN** a source page has no meaningful content and exists only as a hierarchy container
- **THEN** the documentation SHALL state that it transfers as a valid empty page rather than a fallback or degradation

### Requirement: Interactive report quality gates
Project checks SHALL validate reconciled adaptation and degradation accounting in addition to offline behavior, accessibility, localization, theming, responsiveness, privacy, and packaging.

#### Scenario: Browser suite runs
- **WHEN** the maintained Playwright report suite opens a generated report through `file://`
- **THEN** it SHALL exercise reconciled status and quality totals, hierarchy interactions, details, preferences, desktop/mobile themes and languages without application network requests

#### Scenario: Adapted complete page is inspected
- **WHEN** report fixtures contain a complete page with static Grid, layout, or external-reference adaptations
- **THEN** the page SHALL remain complete and adaptations SHALL remain separate from degradations, warnings, and conflicts in every report surface

#### Scenario: Preference controls are inspected
- **WHEN** browser checks activate language and theme buttons
- **THEN** tooltips, accessible names, current and next modes, deterministic cycles, and safe storage persistence SHALL be verified

#### Scenario: Privacy suite runs
- **WHEN** report fixtures contain script-like text, unsafe URLs, private previews, tokens, or email addresses
- **THEN** checks SHALL prove active content is isolated and downloadable JSON plus package contents do not expose protected values

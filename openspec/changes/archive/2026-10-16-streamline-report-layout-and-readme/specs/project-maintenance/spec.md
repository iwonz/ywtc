# Spec Delta

## MODIFIED Requirements

### Requirement: Public repository documentation and metadata
The README SHALL be concise, provider-neutral, and organized by the fixed information architecture covering only current installation, operation, config-only workspaces, compatibility, credentials, parameters, examples, export, state, reports, and development without historical migration guidance.

#### Scenario: First-time setup
- **WHEN** a new operator reads README and the generated template
- **THEN** they SHALL be able to create named connections with direct credentials, validate with doctor, and run a remote transfer or static export without consulting source code

#### Scenario: Runtime compatibility
- **WHEN** package metadata, documentation, CI, or the generated Homebrew formula selects a JavaScript runtime
- **THEN** it SHALL consistently require Node.js 24 and npm 11.5.1 or newer and SHALL NOT claim Node.js 22 support

#### Scenario: A new operator reads the README
- **WHEN** the repository README is opened
- **THEN** it SHALL present the verified full-width header and a concise path to install, initialize, configure, diagnose, dry-run, inspect, and transfer content

#### Scenario: Stable README information architecture
- **WHEN** the README's second-level headings are inspected
- **THEN** their exact order SHALL be `Описание`, `Возможности`, `Установка`, `Минимальный сценарий`, `Конфигурация`, `Направления и совместимость`, `Как получить токены`, `Параметры`, `Частые примеры`, `Файловый экспорт`, `State`, `Отчёты`, and `Разработка`
- **AND** no additional second-level section SHALL be introduced without an explicit specification change

#### Scenario: Minimum migration flow is followed
- **WHEN** an operator wants the shortest safe path from installation to migration
- **THEN** the README SHALL provide exactly three checklist steps: install ywtc, run `ywtc init --interactive`, and run `ywtc migrate --interactive`
- **AND** the two wizards SHALL own connection setup plus the explicit dry-run-to-live handoff without requiring copied commands in the checklist

#### Scenario: Common command variants are needed
- **WHEN** an operator needs a frequent workflow beyond the minimum
- **THEN** the README SHALL show exactly four concise examples covering a remote transfer, scope selection, static export, and report opening
- **AND** each example SHALL omit options supplied by defaults or automatic profile resolution
- **AND** exhaustive direction, profile, workdir, state, and recovery combinations SHALL remain canonical in the compatibility and parameter references rather than being repeated as examples

#### Scenario: Migration coverage is reviewed
- **WHEN** an operator evaluates content fidelity
- **THEN** the README SHALL separately present a detailed supported-content table and a concise not-transferred table
- **AND** the supported-content table SHALL describe hierarchy, text styling, tables, code, links, anchors, downloadable attachments and common file types, images, provider-specific constructs, native equivalents, and loss-aware fallback behavior
- **AND** the not-transferred table SHALL distinguish excluded data from content that is retained as a safe static representation, source link, or raw snapshot

#### Scenario: README readability is reviewed
- **WHEN** documentation repeats a rule, caveat, or operational instruction across sections
- **THEN** the README SHALL keep one canonical explanation and use concise cross-references elsewhere without losing required information
- **AND** it SHALL omit obsolete migration instructions, compatibility guidance, and completed one-time setup procedures

#### Scenario: CLI help is opened
- **WHEN** an operator runs `ywtc --help`, `ywtc <command> --help`, or `ywtc --version`
- **THEN** the output SHALL identify `ywtc`, list the current commands, and provide command-specific usage without requiring configuration

#### Scenario: Platform compatibility is inspected
- **WHEN** an operator evaluates a Yandex Wiki or Confluence connection
- **THEN** the README SHALL identify Public API v1, Data Center 7.9+ without an upper bound subject to capability preflight, Cloud API support, unsupported profiles, and the boundary between contract tests and live certification

#### Scenario: Parameters are inspected
- **WHEN** an operator constructs any supported command or configuration
- **THEN** the README SHALL provide compact complete tables for commands, long and short CLI options, direct connection/profile fields, defaults, accepted formats, examples, and descriptions

#### Scenario: Token setup is inspected
- **WHEN** an operator follows authentication instructions
- **THEN** the README SHALL give short vendor-linked checklists for obtaining Yandex OAuth/IAM, Data Center PAT, and Cloud email/API token and placing them directly in ignored `ywtc.config.yaml` without real credentials in tracked examples

#### Scenario: Package metadata is inspected
- **WHEN** npm or release tooling consumes package metadata
- **THEN** it SHALL name `@iwonz/ywtc`, expose binary `ywtc`, allow public scoped publication, require Node.js 24 and npm 11.5.1 or newer, reference the repository and MIT license, and include only intended publishable files

### Requirement: Universal transfer header
The README header SHALL accurately depict Yandex Wiki and Confluence as sources feeding the `ywtc` pipeline and SHALL depict Confluence, Yandex Wiki, Markdown, and HTML as destinations while preserving the established dark technical visual style.

#### Scenario: Visual transfer matrix is inspected
- **WHEN** a reader views the README header
- **THEN** both remote providers SHALL be identifiable as possible sources
- **AND** both remote providers and both static formats SHALL be identifiable as possible destinations
- **AND** directional connectors SHALL communicate convergence into and branching out of `ywtc`
- **AND** the central transferable-content tiles SHALL remain visually unchanged except that no small arrows SHALL appear between adjacent tiles

#### Scenario: Header is read without images
- **WHEN** the header image is unavailable or interpreted by assistive technology
- **THEN** its alternative text SHALL identify the two source providers, the `ywtc` pipeline, and all four destination types

### Requirement: Provider-neutral report illustration
The package SHALL include a transparent provider-neutral report illustration that identifies both remote sources, the transferable content classes, and all remote and static destinations while matching the README header composition.

#### Scenario: Illustration is rendered in either theme
- **WHEN** the dashboard uses light or dark mode on desktop or mobile
- **THEN** the illustration SHALL remain legible, preserve transparency, fit without clipping, and contain no migration-specific organization data
- **AND** it SHALL preserve the input and output connectors while omitting only the small arrows between adjacent central content tiles

### Requirement: Compact report presentation
The interactive report SHALL prioritize non-zero outcomes, actionable diagnostics, and transfer completeness in a flat document layout while omitting empty metrics and redundant controls.

#### Scenario: Overview contains zero-valued optional metrics
- **WHEN** a report has no excluded pages, failures, conflicts, comments, attachments, or other optional metric values
- **THEN** the overview SHALL omit those zero-value counters and any resulting empty category
- **AND** it SHALL retain the total pages, overall status, canonical source and destination, and report identity needed to understand the run
- **AND** an unavailable required inventory value SHALL use a concise textual empty state rather than a numeric zero

#### Scenario: A non-zero outcome requires attention
- **WHEN** a page, resource, comment archive, quality category, or inventory dimension has a non-zero outcome
- **THEN** the report SHALL display that metric with its semantic label and visual impact treatment
- **AND** the hierarchy and details view SHALL expose the affected object and available corrective action

#### Scenario: Main report layout is inspected
- **WHEN** the report overview and hierarchy render
- **THEN** they SHALL use flat sections, spacing, and separators without outer cards, borders, shadows, blur, rounded islands, or a separate tree container
- **AND** complete hierarchy rows SHALL remain transparent while non-complete rows MAY use a light full-width semantic tint
- **AND** the functional modal MAY remain a distinct overlay surface

#### Scenario: Page details contain empty sections
- **WHEN** a page has no resources, comments, preview, conflicts, or issues for an optional detail category
- **THEN** the details interface SHALL omit the empty category or present one concise empty state only when the absence itself is useful
- **AND** it SHALL NOT repeat zero counters, placeholder definition rows, or unavailable identifiers across the view
- **AND** definition data and technical diagnostics SHALL use flat lists rather than nested tiles

#### Scenario: Offline report interactions are used
- **WHEN** a generated report is opened through `file://` on desktop or mobile
- **THEN** summary, hierarchy, search, problem filters, page details, preferences, JSON download, and sandboxed comparison SHALL remain usable without network requests
- **AND** the interface SHALL retain keyboard navigation, focus management, accessible names, light/dark themes, RU/EN localization, and large-tree virtualization

#### Scenario: UI dependencies are inspected
- **WHEN** project dependencies and report source are reviewed
- **THEN** the report SHALL use one maintained component system rather than a parallel custom shadcn-style primitive layer
- **AND** report-only Radix, Tailwind, CVA, clsx, and tailwind-merge dependencies SHALL be absent

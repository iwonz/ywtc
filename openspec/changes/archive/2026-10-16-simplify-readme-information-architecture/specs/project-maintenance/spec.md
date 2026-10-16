# Spec Delta

## MODIFIED Requirements

### Requirement: Public repository documentation and metadata
The README SHALL be concise, provider-neutral, task-oriented, and complete enough to install, configure, validate, operate, and troubleshoot the current product without historical migration guidance or duplicated rules.

#### Scenario: First-time setup
- **WHEN** a new operator reads README and the generated template
- **THEN** they SHALL be able to create named connections with direct credentials, validate with doctor, and run a remote transfer or static export without consulting source code

#### Scenario: Runtime compatibility
- **WHEN** package metadata, documentation, CI, or the generated Homebrew formula selects a JavaScript runtime
- **THEN** it SHALL consistently require Node.js 24 and npm 11.5.1 or newer and SHALL NOT claim Node.js 22 support

#### Scenario: A new operator reads the README
- **WHEN** the repository README is opened
- **THEN** it SHALL present the verified full-width header, a one-paragraph product definition, and a copyable shortest path to install, initialize, and start an interactive dry-run

#### Scenario: Stable README information architecture
- **WHEN** the README's second-level headings are inspected
- **THEN** their exact order SHALL be `Быстрый старт`, `Возможности`, `Совместимость`, `Конфигурация`, `CLI`, `Файловый экспорт`, `State и повторные запуски`, `Отчёты и статусы`, and `Разработка`
- **AND** installation SHALL live with the guided start, credentials with configuration, common examples with CLI, limitations with capabilities, and outcome definitions with reports

#### Scenario: Minimum migration flow is followed
- **WHEN** an operator wants the shortest safe path from installation to migration
- **THEN** the README SHALL provide copyable commands to install ywtc, run `ywtc init --interactive`, and run `ywtc migrate --interactive`
- **AND** the migration wizard's default dry-run and explicit live handoff SHALL be explained once without a separate duplicate checklist

#### Scenario: Common command variants are needed
- **WHEN** an operator needs a frequent workflow beyond the minimum
- **THEN** the CLI section SHALL show four concise examples covering a remote subtree transfer, linked scope, static export, and report opening
- **AND** each example SHALL omit options supplied by defaults or automatic profile resolution

#### Scenario: Migration coverage is reviewed
- **WHEN** an operator evaluates content fidelity
- **THEN** the capabilities section SHALL contain a detailed supported-content table followed by a concise limitations table
- **AND** the tables SHALL distinguish preserved content, native normalization, complete adaptation, explicit fallback, and excluded data

#### Scenario: README readability is reviewed
- **WHEN** documentation repeats a rule, caveat, status, or operational instruction across sections
- **THEN** the README SHALL retain one canonical explanation and remove the duplicate rather than relying on cross-section repetition
- **AND** it SHALL omit obsolete compatibility guidance, completed one-time setup procedures, filler headings, and prose that only restates a table

#### Scenario: CLI help is opened
- **WHEN** an operator runs `ywtc --help`, `ywtc <command> --help`, or `ywtc --version`
- **THEN** the output SHALL identify `ywtc`, list the current commands, and provide command-specific usage without requiring configuration

#### Scenario: Platform compatibility is inspected
- **WHEN** an operator evaluates a Yandex Wiki or Confluence connection
- **THEN** the compatibility section SHALL identify Public API v1, Data Center 7.9+ without an upper bound subject to capability preflight, Cloud API support, unsupported profiles, and the boundary between contract tests and live certification

#### Scenario: Parameters are inspected
- **WHEN** an operator constructs any supported command or configuration
- **THEN** the configuration and CLI sections SHALL provide compact complete tables for direct connection fields, commands, long and short options, defaults, accepted formats, examples, and descriptions

#### Scenario: Token setup is inspected
- **WHEN** an operator follows authentication instructions
- **THEN** the configuration section SHALL give short vendor-linked checklists for obtaining Yandex OAuth/IAM, Data Center PAT, and Cloud email/API token and placing them directly in ignored `ywtc.config.yaml` without real credentials in tracked examples

#### Scenario: Package metadata is inspected
- **WHEN** npm or release tooling consumes package metadata
- **THEN** it SHALL name `@iwonz/ywtc`, expose binary `ywtc`, allow public scoped publication, require Node.js 24 and npm 11.5.1 or newer, reference the repository and MIT license, and include only intended publishable files

### Requirement: Guided setup documentation and packaging
The public package and README SHALL expose interactive initialization and interactive migration as the shortest guided setup while retaining ordinary commands for automation.

#### Scenario: Minimum guided setup
- **WHEN** a first-time operator follows the quick start
- **THEN** it SHALL contain installation, `ywtc init --interactive`, and `ywtc migrate --interactive` as one copyable sequence
- **AND** interactive migration SHALL default to dry-run and require an explicit live choice

#### Scenario: Automation setup
- **WHEN** an operator does not have an interactive terminal or manages configuration separately
- **THEN** the README SHALL retain concise ordinary `ywtc init`, direct `ywtc.config.yaml`, and non-interactive `ywtc migrate` guidance in their canonical configuration and CLI sections

#### Scenario: Public CLI help
- **WHEN** an operator opens `ywtc init --help`
- **THEN** the packaged CLI SHALL document `--interactive`, `--workdir`, TTY requirements, and the non-interactive alternative without loading configuration

#### Scenario: Public migration help
- **WHEN** an operator opens `ywtc migrate --help`
- **THEN** the packaged CLI SHALL document interactive mode, all supported short aliases, conditional non-interactive endpoint requirements, and the dry-run-first workflow without loading configuration

#### Scenario: Packaged non-TTY behavior
- **WHEN** package verification invokes either interactive wizard without a TTY
- **THEN** it SHALL fail before workspace, destination, or network mutation with the documented actionable message

### Requirement: Content safety and report access documentation
The packaged CLI and README SHALL describe current content-preservation and report-access behavior in the canonical capabilities, state, and reports sections.

#### Scenario: Operator reviews migration safety
- **WHEN** an operator reads the current README
- **THEN** the capabilities and state sections SHALL explain source-derived bodies, resource fallbacks, partial retries, actual-content verification, and the no-deletion boundary without repeating those guarantees in other sections

#### Scenario: Packaged report commands are inspected
- **WHEN** an installed package runs `ywtc --help`, `ywtc reports --help`, or `ywtc migrate --help`
- **THEN** the output SHALL expose report listing, report opening, and opt-in post-run opening without loading connection configuration

### Requirement: Source selection documentation
The README SHALL document complete subtree selection and the provider-neutral source-status filter in the canonical CLI and state sections.

#### Scenario: Operator reviews subtree behavior
- **WHEN** the operator reads the CLI scope reference
- **THEN** it SHALL state that `subtree` and source status `all` are defaults, explain Yandex `actual` and `obsolete` coverage, describe Confluence hierarchy limitations, and show how to select `current`

#### Scenario: Operator changes source status on rerun
- **WHEN** the operator reads the state section
- **THEN** the documentation SHALL explain stable state identity, non-deletion of mappings outside the current selection, and how selected or excluded pages appear in reports

### Requirement: Comment archive documentation
The README SHALL document page comment archival once across capabilities, configuration-free CLI controls, state, reports, and limitations.

#### Scenario: Transfer coverage is reviewed
- **WHEN** an operator reads the capabilities and CLI sections
- **THEN** comments and explicitly linked page attachments SHALL appear as supported content, `--no-comments` SHALL be documented, and reactions plus attachment/blog/custom-content comments SHALL remain listed as limitations

#### Scenario: Failure behavior is reviewed
- **WHEN** an operator reads the state and reports sections
- **THEN** the documentation SHALL explain resumable partial comment outcomes, stale archive preservation, counts, previews, and non-deletion without restating comment rendering details

### Requirement: Transfer outcome documentation
The README SHALL define provider-neutral page and file outcomes in one compact applicability-aware table and SHALL separately define normalization, adaptation, degradation, warning, and error quality dimensions.

#### Scenario: Page status is inspected
- **WHEN** an operator reads `Отчёты и статусы`
- **THEN** one applicability-aware status table SHALL define `complete`, `partial`, `failed`, `blocked`, `conflict`, `planned`, and `not-started` and state the next action
- **AND** it SHALL define `conflict` as proven ambiguous ownership or identity rather than an ordinary destination revision, manual content change, title collision, or generic provider error

#### Scenario: File status is inspected
- **WHEN** the operator reads the same status table
- **THEN** it SHALL identify which outcomes apply to files and comment archives without duplicating their shared definitions
- **AND** it SHALL explain that `planned` is exclusive to dry-run while `blocked` identifies an unmet page dependency

#### Scenario: Quality classification is inspected
- **WHEN** an operator compares complete pages containing normalizations or adaptations with partial pages
- **THEN** documentation SHALL explain that normalizations and adaptations preserve information while degradations identify absent or unverified information and affect completeness

#### Scenario: Failure and dependency are compared
- **WHEN** an operator compares `failed`, `blocked`, `planned`, and `not-started`
- **THEN** documentation SHALL state that `failed` is an unsuccessful attempted operation, `blocked` is an operation not attempted because an upstream dependency is unavailable, `planned` belongs to dry-run, and `not-started` follows interruption

#### Scenario: README structure is checked
- **WHEN** the status documentation is updated
- **THEN** the README SHALL keep status definitions only in `Отчёты и статусы` and SHALL retain the specified nine second-level headings

### Requirement: Interactive report documentation
The README SHALL describe the compact offline dashboard and its distinct information-impact categories within `Отчёты и статусы`.

#### Scenario: Operator reads report guidance
- **WHEN** an operator reads the reports section
- **THEN** it SHALL concisely explain report creation and opening, the flat overview, hierarchy search and filters, per-page details and comparison, preference controls, sanitized JSON download, and quality totals without narrating decorative UI details

### Requirement: Source-authoritative state and report documentation
The README SHALL explain mapped-object authority in `State и повторные запуски` and compact outcome interpretation in `Отчёты и статусы`.

#### Scenario: Mapped destination policy is reviewed
- **WHEN** an operator reads the state section
- **THEN** it SHALL state that current source content and hierarchy replace differing proven mappings through destination version history while unmapped or ambiguously owned objects remain protected

#### Scenario: Conflict status is reviewed
- **WHEN** an operator reads the transfer status table
- **THEN** `conflict` SHALL mean ambiguous ownership or identity rather than an ordinary destination revision or manual content change

#### Scenario: Report interface is reviewed
- **WHEN** an operator reads the reports section
- **THEN** it SHALL describe the compact overview, hierarchy diagnostics, per-page problem details and comparison, icon-only language/theme controls, sanitized JSON download, and report-opening commands without duplicating report behavior elsewhere

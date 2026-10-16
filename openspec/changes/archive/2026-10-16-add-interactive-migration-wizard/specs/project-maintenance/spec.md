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
- **THEN** the README SHALL show only a compact set of common remote transfer, scope, static export, and report-opening commands
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

### Requirement: Guided setup documentation and packaging
The public package and README SHALL expose interactive initialization and interactive migration as the shortest guided setup while retaining ordinary commands for automation and preserving the fixed README section order.

#### Scenario: Minimum guided setup
- **WHEN** a first-time operator follows the README checklist
- **THEN** it SHALL contain installation, `ywtc init --interactive`, and `ywtc migrate --interactive` as its three steps
- **AND** interactive migration SHALL default to dry-run and require an explicit live choice

#### Scenario: Automation setup
- **WHEN** an operator does not have an interactive terminal or manages configuration separately
- **THEN** the README SHALL retain concise ordinary `ywtc init`, direct `ywtc.config.yaml`, and non-interactive `ywtc migrate` guidance without duplicating the parameter reference

#### Scenario: Public CLI help
- **WHEN** an operator opens `ywtc init --help`
- **THEN** the packaged CLI SHALL document `--interactive`, `--workdir`, TTY requirements, and the non-interactive alternative without loading configuration

#### Scenario: Public migration help
- **WHEN** an operator opens `ywtc migrate --help`
- **THEN** the packaged CLI SHALL document interactive mode, all supported short aliases, conditional non-interactive endpoint requirements, and the dry-run-first workflow without loading configuration

#### Scenario: Packaged non-TTY behavior
- **WHEN** package verification invokes either interactive wizard without a TTY
- **THEN** it SHALL fail before workspace, destination, or network mutation with the documented actionable message

## ADDED Requirements

### Requirement: Packaged interactive migration verification
Project and package checks SHALL exercise interactive migration parsing and the wizard state machine without contacting provider APIs or relying on a real TTY.

#### Scenario: Installed package exposes aliases
- **WHEN** package validation inspects installed command help and parses representative invocations
- **THEN** it SHALL confirm every documented migration and update alias maps to the same option as its long form

#### Scenario: Wizard workflow is tested
- **WHEN** automated checks run the prompt-adapter scenarios
- **THEN** they SHALL cover defaults, backward navigation, flag prefill, provider/profile selection, all four destination kinds, conditional archive, nested initialization, cancellation, and dry-run actions

#### Scenario: Safe live handoff is tested
- **WHEN** dry-run results contain blocking or non-blocking outcomes
- **THEN** tests SHALL prove live is offered only for the non-blocking result and starts only after an explicit selection with the same effective migration request

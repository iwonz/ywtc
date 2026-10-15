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
- **THEN** the README SHALL provide a checklist containing installation, workspace initialization, direct profile and credential configuration, a dry run, and the corresponding live run

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
- **THEN** the README SHALL provide compact complete tables for commands, CLI options, direct connection/profile fields, defaults, accepted formats, examples, and descriptions

#### Scenario: Token setup is inspected
- **WHEN** an operator follows authentication instructions
- **THEN** the README SHALL give short vendor-linked checklists for obtaining Yandex OAuth/IAM, Data Center PAT, and Cloud email/API token and placing them directly in ignored `ywtc.config.yaml` without real credentials in tracked examples

#### Scenario: Package metadata is inspected
- **WHEN** npm or release tooling consumes package metadata
- **THEN** it SHALL name `@iwonz/ywtc`, expose binary `ywtc`, allow public scoped publication, require Node.js 24 and npm 11.5.1 or newer, reference the repository and MIT license, and include only intended publishable files

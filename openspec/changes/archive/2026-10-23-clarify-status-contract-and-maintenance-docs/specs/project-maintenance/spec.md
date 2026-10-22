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
- **THEN** the CLI section SHALL show four concise examples covering a remote subtree transfer, linked scope, static export, and targeted retry
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

### Requirement: Conventional Commit enforcement
The project SHALL validate every full maintainer and automation commit message against Conventional Commits and reject generic or work-in-progress subjects.

#### Scenario: Commit range validation
- **WHEN** CI evaluates a pull request or push
- **THEN** Commitlint SHALL check every new commit in the relevant range, including bot commits, with the configured header and body rules

#### Scenario: Generic subject
- **WHEN** a subject is empty, generic, temporary, or marked WIP
- **THEN** commit validation SHALL fail with a corrective Conventional Commit example

#### Scenario: Commit is prepared and pushed
- **WHEN** an agent prepares a commit after the quality gate
- **THEN** it SHALL validate the complete proposed message, including body line lengths, before committing and validate the actual new commit range before pushing
- **AND** a failed commit check SHALL NOT be bypassed by an empty follow-up commit or a narrower unreviewed range

## REMOVED Requirements

### Requirement: Static project quality gates
**Reason**: Replaced by a consolidated current contract with redundant or superseded scenarios removed and unique behavior retained.
**Migration**: The active specification reference is now "Executable project quality gates"; this documentation change requires no runtime conversion or operator action.

### Requirement: Guided setup documentation and packaging
**Reason**: Replaced by a consolidated current contract with redundant or superseded scenarios removed and unique behavior retained.
**Migration**: The active specification reference is now "Guided setup package contract"; this documentation change requires no runtime conversion or operator action.

### Requirement: Transfer outcome documentation
**Reason**: Replaced by a consolidated current contract with redundant or superseded scenarios removed and unique behavior retained.
**Migration**: The active specification reference is now "Deterministic transfer status reference"; this documentation change requires no runtime conversion or operator action.

### Requirement: Source-authoritative state and report documentation
**Reason**: Replaced by a consolidated current contract with redundant or superseded scenarios removed and unique behavior retained.
**Migration**: The active specification reference is now "Mapped-object authority documentation"; this documentation change requires no runtime conversion or operator action.

## ADDED Requirements

### Requirement: Executable project quality gates
The project SHALL keep a high/critical production dependency audit, TypeScript typechecking, Biome lint checks, Knip unused-code checks, Vitest tests, package verification, build validation, OpenSpec strict validation, graph performance checks, and static HTML browser smoke checks executable through maintained scripts.

#### Scenario: A maintainer checks the repository
- **WHEN** `npm run check` is executed in a clean supported environment
- **THEN** release hygiene, production dependency audit, typechecking, Biome, Knip, tests, browser checks, build, package verification, and strict OpenSpec validation SHALL all run and fail the command on violations

### Requirement: Guided setup package contract
The public package and README SHALL expose interactive initialization and interactive migration as the shortest guided setup while retaining ordinary commands for automation.

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

### Requirement: Deterministic transfer status reference
The README SHALL explain every current reported status in object-specific tables with numbered assignment conditions, applicability, and an operator action, while keeping outcome, quality, retryability, and exit code distinct.

#### Scenario: Operator inspects an object status
- **WHEN** an operator reads `Отчёты и статусы`
- **THEN** tables SHALL cover pages, files, comment archives, Grid snapshots, mentions, runs, excluded pages, and traversal edges using their current vocabularies
- **AND** each status SHALL have a dedicated conditions column containing a numbered list of deterministic assignment branches and a next action

#### Scenario: Incomplete status is interpreted
- **WHEN** a page, file, or archive is failed, blocked, or not-started
- **THEN** documentation SHALL explain whether the current operation lacks verification or a dependency, and SHALL NOT imply that previous or bootstrap destination data is absent

#### Scenario: Intermediate or reserved value is inspected
- **WHEN** a status exists only during processing or is accepted by the current type but has no automatic producer
- **THEN** documentation SHALL explicitly identify that scope and SHALL NOT invent reachable assignment conditions
- **AND** planned SHALL be described as dry-run-only in finalized outcomes rather than forbidden during live preparation

#### Scenario: Run status and exit code are inspected
- **WHEN** an operator compares run status, object outcomes, issues, and command exit code
- **THEN** documentation SHALL state their current precedence, warning/degradation behavior, signal handling, and retry completion rules without equating partial-page count with a nonzero normal-migration exit code

#### Scenario: Quality and retryability are inspected
- **WHEN** a complete page has an adaptation, normalization, preserved external reference, or unresolved mention warning
- **THEN** documentation SHALL distinguish completeness from notification delivery, warnings from degradations, and transient mention retry from terminal unresolved identity

#### Scenario: README status coverage is checked
- **WHEN** repository validation runs
- **THEN** it SHALL reject missing or malformed numbered status-condition tables
- **AND** tests SHALL compare the documented values with current state and domain status unions so an added status requires documentation review

#### Scenario: README structure is checked
- **WHEN** the status reference is updated
- **THEN** status definitions SHALL remain only in `Отчёты и статусы` within the existing nine second-level headings

### Requirement: Mapped-object authority documentation
The README SHALL explain mapped-object authority in `State и повторные запуски` and compact outcome interpretation in `Отчёты и статусы`.

#### Scenario: Mapped destination policy is reviewed
- **WHEN** an operator reads the state section
- **THEN** it SHALL state that current source content and hierarchy replace differing proven mappings through destination version history while unmapped or ambiguously owned objects remain protected

### Requirement: Canonical maintenance documentation
Current specifications SHALL describe the current product, README SHALL own operator guidance, AGENTS SHALL own the contributor workflow, and OpenSpec context SHALL summarize stable constraints without duplicating those references.

#### Scenario: Documentation is maintained
- **WHEN** a change updates a public option, default, status, retry rule, configuration field, or release process
- **THEN** the maintainer SHALL verify it against the implementing source and update its canonical documentation and affected current specifications together

#### Scenario: Historical requirements are found
- **WHEN** an active requirement still mandates a completed release, retired configuration, superseded policy, or duplicate scenario
- **THEN** maintenance SHALL replace or consolidate it with the current general contract while retaining unique coverage and leaving archived changes and changelog history unchanged

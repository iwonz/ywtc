# project-maintenance Specification

## Purpose
Maintain ywtc as a public, testable, documented, and release-safe TypeScript project with a mandatory OpenSpec change lifecycle.

## Requirements

### Requirement: Complete OpenSpec change lifecycle
Repository agents MUST synchronize a clean local `master` with `origin/master` before starting a change, execute the complete OpenSpec lifecycle for every code, documentation, tooling, or specification change, and repeat the remote comparison before commit and push.

#### Scenario: An agent begins a clean change
- **WHEN** local `master` is clean and not diverged
- **THEN** the agent MUST fetch and fast-forward pull `origin/master`, then create and validate proposal, specification, design, and task artifacts before implementation

#### Scenario: Repository is dirty or diverged
- **WHEN** synchronization detects uncommitted content, another branch, or diverged history
- **THEN** the agent MUST stop, report the condition, and MUST NOT discard or rewrite existing work

#### Scenario: An agent completes implementation
- **WHEN** all implementation tasks and checks succeed
- **THEN** it MUST update task status, sync delta specifications, archive the change, run strict validation, fetch and compare with `origin/master`, and only then commit and push without force

### Requirement: Static project quality gates
The project SHALL keep a high/critical production dependency audit, TypeScript typechecking, Biome lint/format checks, Knip unused-code checks, Vitest tests, package verification, build validation, OpenSpec strict validation, graph performance checks, and static HTML browser smoke checks executable through maintained scripts.

#### Scenario: Complete project check
- **WHEN** a maintainer runs `npm run check`
- **THEN** all configured security, static, unit, integration, package, performance, browser, build, and specification checks SHALL execute without rewriting tracked files

#### Scenario: A maintainer checks the repository
- **WHEN** `npm run check` is executed in a clean supported environment
- **THEN** release hygiene, production dependency audit, typechecking, Biome, Knip, tests, browser checks, build, package verification, and strict OpenSpec validation SHALL all run and fail the command on violations

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

### Requirement: Installable package verification
The public `@iwonz/ywtc` package SHALL include the universal `ywtc` binary, an empty current configuration template, README, license, changelog, and required generated assets while excluding populated configuration, credentials, workdirs, state, cache, exports, reports, and tests.

#### Scenario: Packed CLI smoke test
- **WHEN** the tarball is installed in an isolated environment
- **THEN** `ywtc --version`, help, config-only initialization, strict profile validation, and non-mutating example parsing SHALL work on supported Node.js versions

#### Scenario: Package acceptance
- **WHEN** release validation packs the project
- **THEN** it SHALL install that archive into an isolated prefix and successfully run `ywtc --version`, `ywtc --help`, and workspace initialization without relying on source-only files or creating `.env` and marker files

### Requirement: Conventional Commit enforcement
The project SHALL validate every maintainer and automation commit subject against Conventional Commits and reject generic or work-in-progress subjects.

#### Scenario: Commit range validation
- **WHEN** CI evaluates a pull request or push
- **THEN** Commitlint SHALL check every new commit in the relevant range, including bot commits

#### Scenario: Generic subject
- **WHEN** a subject is empty, generic, temporary, or marked WIP
- **THEN** commit validation SHALL fail with a corrective Conventional Commit example

### Requirement: Maintained GitHub Actions runtimes
The release workflow SHALL use supported major versions of its JavaScript actions and SHALL avoid action runtimes GitHub marks deprecated.

#### Scenario: Workflow action versions are reviewed
- **WHEN** CI executes checkout, Node.js setup, or Release Please
- **THEN** the workflow SHALL use `actions/checkout@v7`, `actions/setup-node@v7`, and `googleapis/release-please-action@v5` or later compatible maintained majors

### Requirement: Universal transfer header
The README header SHALL accurately depict Yandex Wiki and Confluence as sources feeding the `ywtc` pipeline and SHALL depict Confluence, Yandex Wiki, Markdown, and HTML as destinations while preserving the established dark technical visual style.

#### Scenario: Visual transfer matrix is inspected
- **WHEN** a reader views the README header
- **THEN** both remote providers SHALL be identifiable as possible sources
- **AND** both remote providers and both static formats SHALL be identifiable as possible destinations
- **AND** directional connectors SHALL communicate convergence into and branching out of `ywtc`

#### Scenario: Header is read without images
- **WHEN** the header image is unavailable or interpreted by assistive technology
- **THEN** its alternative text SHALL identify the two source providers, the `ywtc` pipeline, and all four destination types

### Requirement: Guided setup documentation and packaging
The public package and README SHALL expose interactive initialization as the shortest guided setup while retaining ordinary initialization for automation and preserving the fixed README section order.

#### Scenario: Minimum guided setup
- **WHEN** a first-time operator follows the README checklist
- **THEN** it SHALL lead through installation, `ywtc init --interactive`, connection-only verification, a dry run, and the corresponding live migration without manual YAML editing

#### Scenario: Automation setup
- **WHEN** an operator does not have an interactive terminal or manages configuration separately
- **THEN** the README SHALL retain concise ordinary `ywtc init` and direct `ywtc.config.yaml` guidance without duplicating the parameter reference

#### Scenario: Public CLI help
- **WHEN** an operator opens `ywtc init --help`
- **THEN** the packaged CLI SHALL document `--interactive`, `--workdir`, TTY requirements, and the non-interactive alternative without loading configuration

#### Scenario: Packaged non-TTY behavior
- **WHEN** package verification invokes `ywtc init --interactive` without a TTY
- **THEN** it SHALL fail before workspace or network mutation with the documented actionable message

### Requirement: Content safety and report access documentation
The packaged CLI and README SHALL describe current content-preservation and report-access behavior within the existing fixed information architecture.

#### Scenario: Operator reviews migration safety
- **WHEN** an operator reads the current README
- **THEN** the existing Features, State, and Reports sections SHALL explain source-derived bootstrap bodies, resource fallbacks, partial retries, actual-content verification, report URLs, and report commands without adding a new second-level section

#### Scenario: Packaged report commands are inspected
- **WHEN** an installed package runs `ywtc --help`, `ywtc reports --help`, or `ywtc migrate --help`
- **THEN** the output SHALL expose report listing, report opening, and opt-in post-run opening without loading connection configuration

### Requirement: Source selection documentation
The README SHALL document complete subtree selection and the provider-neutral source-status filter inside the existing Parameters, Frequent examples, State, and Reports sections without adding a new top-level section.

#### Scenario: Operator reviews subtree behavior
- **WHEN** an operator reads the parameter table and subtree examples
- **THEN** the documentation SHALL state that `all` is the default, explain Yandex `actual` and `obsolete` coverage, describe Confluence hierarchy limitations, and show a current-only command

#### Scenario: Operator changes source status on rerun
- **WHEN** an operator reads the State and Reports sections
- **THEN** the documentation SHALL explain stable state identity, non-deletion of mappings outside the current selection, selected/excluded counts, and hierarchy repair reporting

### Requirement: Comment archive documentation
The README SHALL describe page comment archival, authorship, nesting, statuses, comment attachment ZIPs, default enablement, disable flag, resumable outcomes, and limitations within the existing fixed information architecture.

#### Scenario: Transfer coverage is reviewed
- **WHEN** an operator reads the Features and Parameters sections
- **THEN** comments and explicitly linked page attachments SHALL appear as supported content, `--no-comments` SHALL be documented, and reactions plus attachment/blog/custom-content comments SHALL remain listed as not transferred

#### Scenario: Failure behavior is reviewed
- **WHEN** an operator reads the State and Reports sections
- **THEN** the documentation SHALL explain partial comment outcomes, conflict/stale preservation, exact counts, archive previews, and non-deletion without adding a new second-level section

### Requirement: Packaged comment CLI verification
Package and project checks SHALL exercise the public comment flags, provider contracts, normalized rendering, deterministic archives, resume behavior, report reconciliation, and filesystem output without including runtime comments or identity data in the published package.

#### Scenario: Packaged help
- **WHEN** an installed package runs `ywtc migrate --help` or `ywtc doctor --help`
- **THEN** both commands SHALL document comments enabled by default and the `--no-comments` opt-out without loading workspace configuration

#### Scenario: Publication hygiene
- **WHEN** the npm package is packed
- **THEN** source fixtures, cached comment bodies, generated ZIPs, reports, tokens, email addresses, and runtime state SHALL be excluded

### Requirement: Transfer outcome documentation
The README SHALL define current page and file outcome semantics inside the existing Reports section without introducing another second-level section.

#### Scenario: Page status is inspected
- **WHEN** an operator reads `### Статусы переноса` under `## Отчёты`
- **THEN** a page-status table SHALL define `complete`, `partial`, `failed`, `blocked`, `conflict`, `planned`, and `not-started`
- **AND** it SHALL state whether destination data was written and the appropriate user action for each status

#### Scenario: File status is inspected
- **WHEN** an operator reads the same subsection
- **THEN** a separate file-status table SHALL define `complete`, `partial`, `failed`, `blocked`, `planned`, and `not-started`
- **AND** it SHALL explain that `planned` is exclusive to dry-run while `blocked` identifies an unmet page dependency

#### Scenario: Failure and dependency are compared
- **WHEN** an operator compares `failed` with `blocked`
- **THEN** the documentation SHALL explain that `failed` means an operation was attempted unsuccessfully while `blocked` means it was intentionally not attempted because an upstream dependency failed or conflicted

#### Scenario: README structure is checked
- **WHEN** the status documentation is added
- **THEN** the README SHALL retain its exact thirteen second-level headings and SHALL NOT duplicate status definitions in another section

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

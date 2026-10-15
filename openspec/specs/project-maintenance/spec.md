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
The repository SHALL describe ywtc as a provider-neutral Yandex Wiki/Confluence transfer and static export CLI, require Node.js 24 and npm 11.5.1 or newer, and SHALL document profiles, secrets, endpoint formats, scopes, direction matrix, filesystem formats, state/resume behavior, fidelity safeguards, examples, compatibility, and the breaking v2 migration.

#### Scenario: First-time setup
- **WHEN** a new operator reads README and generated templates
- **THEN** they SHALL be able to create named connections, obtain/configure required credentials, validate with doctor, and run a remote transfer or static export without consulting source code

#### Scenario: Runtime compatibility
- **WHEN** package metadata, documentation, CI, or the generated Homebrew formula selects a JavaScript runtime
- **THEN** it SHALL consistently require Node.js 24 and npm 11.5.1 or newer and SHALL NOT claim Node.js 22 support

#### Scenario: A new operator reads the README
- **WHEN** the repository README is opened
- **THEN** it SHALL present the verified full-width header and a concise path to install, initialize, diagnose, dry-run, inspect, and transfer content

#### Scenario: Minimum migration flow is followed
- **WHEN** an operator wants the shortest safe path from installation to migration
- **THEN** the README SHALL provide a checklist containing installation, workspace initialization, profile/secret configuration, a dry run, and the corresponding live run

#### Scenario: Common command variants are needed
- **WHEN** an operator needs a frequent workflow beyond the minimum
- **THEN** the README SHALL provide nearby examples for all remote directions, page/linked scopes, filesystem exports, custom workdirs, and fresh runs without duplicating the parameter reference

#### Scenario: Migration coverage is reviewed
- **WHEN** an operator evaluates what will and will not be transferred
- **THEN** the README SHALL present supported content, transformations, degradation behavior, and exclusions in a compact table

#### Scenario: README readability is reviewed
- **WHEN** documentation repeats a rule, caveat, or operational instruction across sections
- **THEN** the README SHALL keep one canonical explanation and use concise cross-references elsewhere without losing required information

#### Scenario: CLI help is opened
- **WHEN** an operator runs `ywtc --help`, `ywtc <command> --help`, or `ywtc --version`
- **THEN** the output SHALL identify `ywtc`, list the explicit v2 commands, and provide command-specific current usage without requiring configuration

#### Scenario: Platform compatibility is inspected
- **WHEN** an operator evaluates a Yandex Wiki or Confluence connection
- **THEN** the README SHALL identify Public API v1, Data Center 7.9+ without an upper bound subject to capability preflight, Cloud API support, unsupported profiles, and the boundary between contract tests and live certification

#### Scenario: Parameters are inspected
- **WHEN** an operator constructs a command or configuration
- **THEN** the README SHALL provide compact complete tables for commands, CLI options, profile fields, and secret environment variables with requirement conditions, accepted formats, defaults, examples, and descriptions

#### Scenario: Token setup is inspected
- **WHEN** an operator follows authentication instructions
- **THEN** the README SHALL give short vendor-linked checklists for Yandex OAuth/IAM, Data Center PAT, and Cloud email/API token without real credentials

#### Scenario: Package metadata is inspected
- **WHEN** npm or release tooling consumes package metadata
- **THEN** it SHALL name `@iwonz/ywtc`, expose binary `ywtc`, allow public scoped publication, require Node.js 24 and npm 11.5.1 or newer, reference the repository and MIT license, and include only intended publishable files

### Requirement: Installable package verification
The public `@iwonz/ywtc` package SHALL include the universal `ywtc` binary, runtime templates, README, license, changelog, and required generated assets while excluding credentials, workdirs, state, cache, exports, reports, and tests.

#### Scenario: Packed CLI smoke test
- **WHEN** the tarball is installed in an isolated environment
- **THEN** `ywtc --version`, help, init, profile validation, and non-mutating example parsing SHALL work on supported Node.js versions

#### Scenario: Package acceptance
- **WHEN** release validation packs the project
- **THEN** it SHALL install that archive into an isolated prefix and successfully run `ywtc --version`, `ywtc --help`, and workspace initialization without relying on source-only files

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

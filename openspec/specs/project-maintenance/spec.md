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
The project SHALL use Biome for linting and Knip for unused file, dependency, and export analysis, and SHALL provide a single command that runs all release checks.

#### Scenario: A maintainer checks the repository
- **WHEN** `npm run check` is executed in a clean supported environment
- **THEN** release hygiene, typechecking, Biome, Knip, tests, build, and strict OpenSpec validation SHALL all run and fail the command on violations

### Requirement: Public repository documentation and metadata
The project SHALL consistently identify itself as `ywtc` and the public npm package `@iwonz/ywtc`, SHALL identify its MIT license and public repository, and SHALL provide concise, neutral, non-repetitive, current-only documentation for installation, supported vendor APIs/products, credentials, workdir initialization, commands, complete environment and CLI parameters, state, reports, updates, releases, breaking migration, and local development.

#### Scenario: A new operator reads the README
- **WHEN** the repository README is opened
- **THEN** it SHALL present a visually verified full-width dark technical header showing Yandex Wiki, the `ywtc` migration pipeline, and Confluence, without colored frames around the source panel, destination panel, or central pipeline, plus a short path to install, initialize, diagnose, dry-run, inspect, and migrate

#### Scenario: README readability is reviewed
- **WHEN** documentation repeats a rule, caveat, or operational instruction across sections
- **THEN** the README SHALL keep one canonical explanation and use concise cross-references elsewhere without losing required information

#### Scenario: CLI help is opened
- **WHEN** an operator runs `ywtc --help`, `ywtc <command> --help`, or `ywtc --version`
- **THEN** the output SHALL identify `ywtc`, list the explicit v2 commands, and provide command-specific current usage without requiring configuration

#### Scenario: Platform compatibility is inspected
- **WHEN** an operator evaluates a Yandex Wiki or Confluence target
- **THEN** the README SHALL identify Public API v1, Data Center 7.9+ without an upper bound subject to capability preflight, Cloud API support, unsupported Server/auth profiles, the review date, and the boundary between contract tests and live certification

#### Scenario: Parameters are inspected
- **WHEN** an operator constructs a command or configuration
- **THEN** the README SHALL provide compact complete tables for commands, CLI options, and environment variables with type, requirement conditions, accepted values/formats, defaults, examples, and descriptions without a duplicated reference section

#### Scenario: Token setup is inspected
- **WHEN** an operator follows authentication instructions
- **THEN** the README SHALL give short vendor-linked checklists for Yandex OAuth/IAM, Data Center PAT, and Cloud email/API token without real credentials

#### Scenario: Package metadata is inspected
- **WHEN** npm or release tooling consumes package metadata
- **THEN** it SHALL name `@iwonz/ywtc`, expose binary `ywtc`, allow public scoped publication, require Node.js 22.12 or newer, reference the repository and MIT license, and include only intended publishable files

### Requirement: Installable package verification
The project SHALL verify the exact packed npm artifact in an isolated environment before publication.

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

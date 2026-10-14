## MODIFIED Requirements

### Requirement: Public repository documentation and metadata
The project SHALL consistently identify itself as `ywtc` and the public npm package `@iwonz/ywtc`, SHALL identify its MIT license and public repository, and SHALL provide concise, neutral, non-repetitive, current-only documentation for installation, supported vendor APIs/products, credentials, workdir initialization, commands, complete environment and CLI parameters, state, reports, updates, releases, breaking migration, and local development.

#### Scenario: A new operator reads the README
- **WHEN** the repository README is opened
- **THEN** it SHALL present a visually verified full-width dark technical header showing Yandex Wiki, the `ywtc` migration pipeline, and Confluence, without colored frames around the source panel, destination panel, or central pipeline, plus a short path to install, initialize, diagnose, dry-run, inspect, and migrate

#### Scenario: Minimum migration flow is followed
- **WHEN** an operator wants the shortest safe path from installation to migration
- **THEN** the README SHALL provide a checklist containing workspace initialization, environment configuration, a dry run, and the corresponding live run without optional diagnostics or advanced state controls

#### Scenario: Common command variants are needed
- **WHEN** an operator needs a frequent workflow beyond the minimum
- **THEN** the README SHALL provide a separate nearby examples section for diagnostics, a single page, URL inputs, a custom workdir, and a fresh run without duplicating the complete parameter reference

#### Scenario: Migration coverage is reviewed
- **WHEN** an operator evaluates what will and will not be migrated
- **THEN** the README SHALL present supported content, transformations, degradation behavior, and exclusions in a compact table

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

## ADDED Requirements

### Requirement: Complete OpenSpec change lifecycle
Repository agents MUST execute the complete OpenSpec lifecycle for every code, documentation, tooling, or specification change.

#### Scenario: An agent begins a change
- **WHEN** an agent is asked to modify the project
- **THEN** it MUST create and validate proposal, specification, design, and task artifacts before implementation

#### Scenario: An agent completes implementation
- **WHEN** all implementation tasks and checks succeed
- **THEN** it MUST update task status, sync delta specifications, archive the change, and run strict validation against all OpenSpec content

### Requirement: Static project quality gates
The project SHALL use Biome for linting and Knip for unused file, dependency, and export analysis, and SHALL provide a single command that runs all release checks.

#### Scenario: A maintainer checks the repository
- **WHEN** `npm run check` is executed in a clean supported environment
- **THEN** release hygiene, typechecking, Biome, Knip, tests, build, and strict OpenSpec validation SHALL all run and fail the command on violations

### Requirement: Public repository documentation and metadata
The project SHALL identify its MIT license and public repository and SHALL provide concise documentation for purpose, quick local setup, dry-run/live execution, reports, and local development.

#### Scenario: A new operator reads the README
- **WHEN** the repository README is opened
- **THEN** it SHALL present an original full-width thematic header and a checklist sufficient to configure, dry-run, inspect, and execute a migration

#### Scenario: Package metadata is inspected
- **WHEN** package metadata is consumed by development or publication tooling
- **THEN** it SHALL reference `https://github.com/iwonz/ywtc`, the MIT license, and only publishable project files

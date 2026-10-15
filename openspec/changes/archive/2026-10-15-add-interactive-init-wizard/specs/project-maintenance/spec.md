# project-maintenance Delta

## ADDED Requirements

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

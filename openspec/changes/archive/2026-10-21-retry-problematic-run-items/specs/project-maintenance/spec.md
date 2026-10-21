# Spec Delta

## ADDED Requirements

### Requirement: Packaged targeted retry workflow
The public package and canonical README SHALL expose the run-correlated retry workflow with its safe defaults, report lineage, exit behavior, and no-deletion boundary.

#### Scenario: Public retry help is inspected
- **WHEN** an installed package runs `ywtc retry --help`
- **THEN** it SHALL document the required canonical Run ID and the `--workdir`, `--dry-run`, `--open-report`, and `--concurrency` aliases without loading connection configuration

#### Scenario: Operator reads continuation guidance
- **WHEN** an operator reads the CLI, state, or reports documentation
- **THEN** one canonical explanation SHALL show `ywtc retry <run-id>`, define actionable versus terminal outcomes, and explain that repeated root Run IDs continue the latest live lineage without repeating successful objects

#### Scenario: Package verification runs
- **WHEN** the npm tarball is installed in isolation
- **THEN** smoke tests SHALL verify retry help and deterministic local report/state planning without credentials, provider access, or destination mutation

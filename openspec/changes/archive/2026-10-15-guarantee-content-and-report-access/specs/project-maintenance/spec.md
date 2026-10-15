# Spec Delta

## ADDED Requirements

### Requirement: Content safety and report access documentation
The packaged CLI and README SHALL describe current content-preservation and report-access behavior within the existing fixed information architecture.

#### Scenario: Operator reviews migration safety
- **WHEN** an operator reads the current README
- **THEN** the existing Features, State, and Reports sections SHALL explain source-derived bootstrap bodies, resource fallbacks, partial retries, actual-content verification, report URLs, and report commands without adding a new second-level section

#### Scenario: Packaged report commands are inspected
- **WHEN** an installed package runs `ywtc --help`, `ywtc reports --help`, or `ywtc migrate --help`
- **THEN** the output SHALL expose report listing, report opening, and opt-in post-run opening without loading connection configuration

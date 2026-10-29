## ADDED Requirements

### Requirement: Packaged local control-center verification
Project and package gates SHALL exercise the installed local application and background worker on supported platforms, including queue lifecycle, replay, security, selective operations and decision revisions without real provider data. Canonical CLI/status documentation SHALL stay within the existing nine README sections.

#### Scenario: Published package is installed
- **WHEN** isolated package checks run on Linux or macOS
- **THEN** ui startup, background submission/control, local assets and report generation SHALL work without source files, credentials or external UI dependencies

#### Scenario: Job statuses are documented
- **WHEN** operator status guidance is validated
- **THEN** each job lifecycle value SHALL have numbered assignment conditions and an action, separately from object outcome, migration result and acceptance exit code

#### Scenario: Large or hostile local data is inspected
- **WHEN** browser fixtures contain large catalogs, script-like data, stale cursors, invalid sessions or escaping paths
- **THEN** checks SHALL verify responsive bounded projections, isolated previews, access rejection and no unintended provider mutation

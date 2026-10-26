## MODIFIED Requirements

### Requirement: Mention transfer documentation and quality gates
Canonical documentation and checks SHALL cover off/mapping policies, strict decision files, source-only inventory, offline editing, safe comment links, historical outcome readability, and publication privacy within the existing nine README sections.

#### Scenario: Operator configures mention transfer
- **WHEN** the operator reads configuration and CLI guidance
- **THEN** documentation SHALL show off and mappingFile, explain skip/url and missing-entry behavior, and give mention export plus JSON editing instructions without a migration guide

#### Scenario: Operator interprets mention outcomes
- **WHEN** mention status conditions are inspected
- **THEN** preserved and linked SHALL identify their exact active producers, historical values SHALL be marked historical, and reserved failed SHALL not have invented producers

#### Scenario: Package checks run
- **WHEN** complete project or installed-package checks run
- **THEN** they SHALL exercise strict mapping validation, shared scanning, effective fingerprints, source-only export, offline import/edit/delete/save, and lack of destination lookup or background requests

#### Scenario: Reports and package are inspected
- **WHEN** generated editor bundles, reports, logs, state, or npm contents are inspected
- **THEN** they SHALL contain no credentials, hidden user fields, migration-specific source data, or runtime decision catalogs in the public package

### Requirement: Deterministic transfer status reference
The README SHALL explain every reported status in object-specific tables with numbered conditions, applicability, and an operator action, keeping current producers, historical values, outcome, quality, retryability, and exit code distinct.

#### Scenario: Operator inspects an object status
- **WHEN** an operator reads reports and statuses
- **THEN** tables SHALL cover pages, files, comment archives, Grid snapshots, mentions, runs, exclusions, traversal and inventory with numbered deterministic conditions and next actions

#### Scenario: Incomplete status is interpreted
- **WHEN** a page, file, or archive is failed, blocked, or not-started
- **THEN** documentation SHALL distinguish missing verification or dependencies from absence of previous or bootstrap data

#### Scenario: Intermediate or reserved value is inspected
- **WHEN** a value is intermediate, historical, or reserved without an active producer
- **THEN** documentation SHALL identify that scope explicitly without inventing active assignment conditions

#### Scenario: Run status and exit code are inspected
- **WHEN** run result, object outcome, issue, and exit code are compared
- **THEN** documentation SHALL state their distinct precedence, signal behavior, and retry rules

#### Scenario: Quality and retryability are inspected
- **WHEN** a complete page has a normalization, adaptation, external reference, or preserved mention
- **THEN** documentation SHALL distinguish completeness from representation and SHALL NOT describe removed lookup retry as active work

#### Scenario: README status coverage is checked
- **WHEN** repository validation runs
- **THEN** malformed or missing numbered tables SHALL fail and tests SHALL compare documented status values with their domain and state vocabularies

#### Scenario: README structure is checked
- **WHEN** the reference is updated
- **THEN** status definitions SHALL remain in reports and statuses within the existing nine second-level headings

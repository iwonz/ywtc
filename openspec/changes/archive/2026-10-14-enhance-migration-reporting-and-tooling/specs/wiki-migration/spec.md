## ADDED Requirements

### Requirement: Detailed local migration report
The system SHALL create one ignored report directory per run containing a self-contained HTML report and downloadable JSON metadata, without credentials or authorization headers.

#### Scenario: Report bundle is written
- **WHEN** a dry-run or live migration reaches report generation
- **THEN** the system SHALL write `index.html` and `report.json` under a unique directory inside the configured state directory's `reports` folder

#### Scenario: Migration hierarchy is inspected
- **WHEN** an operator opens the HTML report
- **THEN** the report SHALL show nested source pages with titles, statuses, source and destination references, resource counts and sizes, link/image/table/code metrics, warnings, errors, and stale destination mappings where applicable

#### Scenario: A page comparison is opened
- **WHEN** an operator selects a page in the HTML report
- **THEN** the report SHALL show sandboxed source and destination content previews side by side and identify whether the destination came from Confluence rendered view or a local dry-run fallback

#### Scenario: Metadata is downloaded
- **WHEN** an operator activates the JSON download control
- **THEN** the browser SHALL download the metadata for that report without embedding source or destination page bodies in the JSON

#### Scenario: Runtime privacy is preserved
- **WHEN** reports are generated with the default state location or package files are enumerated
- **THEN** report folders SHALL remain ignored by Git and excluded from package publication

## MODIFIED Requirements

### Requirement: Reliability and auditability
The system SHALL apply bounded retries to transient API failures, atomically persist state after mutations, verify destination objects, and produce a per-run HTML and JSON report bundle.

#### Scenario: Transient API error
- **WHEN** an API returns 429, 5xx, or a retriable network error
- **THEN** the system SHALL retry within configured bounds and respect Retry-After when supplied

#### Scenario: Partial failure
- **WHEN** one page or resource cannot be migrated
- **THEN** the system SHALL record the failure in report metadata and the HTML status interface, continue independent work where safe, and exit non-zero

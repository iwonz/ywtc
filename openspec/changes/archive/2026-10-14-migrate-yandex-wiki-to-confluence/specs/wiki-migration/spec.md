## ADDED Requirements

### Requirement: CLI configuration and preflight
The system SHALL accept a source Wiki slug or URL and a target Confluence page ID or URL, validate all required environment variables, and complete read-only preflight checks before creating destination content.

#### Scenario: Valid dry-run
- **WHEN** the operator supplies valid credentials, source, target, and `--dry-run`
- **THEN** the system SHALL discover and analyze the subtree without issuing Confluence mutation requests

#### Scenario: Invalid configuration
- **WHEN** a required credential, organization identifier, URL, source, or target is invalid
- **THEN** the system SHALL exit non-zero before creating destination content and SHALL NOT reveal secrets

### Requirement: Hierarchical page migration
The system SHALL create the source root below the selected target and preserve the accessible parent-child hierarchy for all migrated descendants.

#### Scenario: Nested subtree
- **WHEN** a source section contains multiple page levels
- **THEN** every migrated page SHALL have the corresponding migrated parent in Confluence

### Requirement: Content and resource fidelity
The system SHALL convert current YFM content to valid Confluence storage format and migrate downloadable attachments, embedded Wiki images, internal links, tables, and static snapshots of dynamic grids.

#### Scenario: Internal links and attachments
- **WHEN** a page references another page in the selected subtree and a downloadable attachment
- **THEN** the final Confluence body SHALL reference the migrated page and uploaded attachment rather than the original internal resource

#### Scenario: Unsupported rich content
- **WHEN** a YFM construct has no standard Confluence equivalent
- **THEN** the system SHALL preserve a readable static or source-text fallback and record a degradation warning

### Requirement: Safe conflicts and reruns
The system SHALL use stable title suffixes for collisions and SHALL persist enough state to resume or rerun without duplicating previously mapped content.

#### Scenario: Duplicate title
- **WHEN** a source title conflicts with another source page or an existing destination-space title
- **THEN** the system SHALL choose a deterministic suffixed title and record the rename

#### Scenario: Interrupted migration
- **WHEN** a prior run created pages or attachments and then stopped
- **THEN** a rerun with the same state SHALL update those mapped objects instead of creating duplicates

### Requirement: Reliability and auditability
The system SHALL apply bounded retries to transient API failures, atomically persist state after mutations, verify destination objects, and produce JSON and Markdown reports.

#### Scenario: Transient API error
- **WHEN** an API returns 429, 5xx, or a retriable network error
- **THEN** the system SHALL retry within configured bounds and respect Retry-After when supplied

#### Scenario: Partial failure
- **WHEN** one page or resource cannot be migrated
- **THEN** the system SHALL record the failure, continue independent work where safe, and exit non-zero

### Requirement: Non-destructive behavior
The system MUST NOT delete destination content, adopt unrelated pages implicitly, or store credentials in state and reports.

#### Scenario: Source page removed after migration
- **WHEN** a previously migrated source page is absent on a later run
- **THEN** the destination page SHALL remain untouched and the report SHALL identify it as stale

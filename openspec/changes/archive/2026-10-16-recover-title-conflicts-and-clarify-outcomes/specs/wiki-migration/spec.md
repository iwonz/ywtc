# Spec Delta

## ADDED Requirements

### Requirement: Authoritative create-time title collision recovery
The system SHALL treat a destination create response as authoritative for title uniqueness and SHALL recover a recognized duplicate-title rejection through bounded deterministic names without modifying or adopting unrelated content.

#### Scenario: Lookup misses a conflicting Confluence title
- **WHEN** a space-wide title lookup returns no page but Confluence rejects creation with a recognized duplicate-title `400` or `409`
- **THEN** the system SHALL retry with the stable slug suffix, then the canonical-source hash suffix, and then bounded deterministic sequence suffixes
- **AND** it SHALL verify the created page's parent and source-derived bootstrap body before processing descendants

#### Scenario: Conflict is occupied repeatedly
- **WHEN** more than one deterministic candidate is rejected as a duplicate title
- **THEN** the system SHALL try at most ten candidates in stable order and SHALL fail the source page once when every candidate is exhausted

#### Scenario: Create response is ambiguous
- **WHEN** page creation has an ambiguous outcome
- **THEN** the system SHALL search below the expected parent and adopt only a page whose source-derived bootstrap is semantically equivalent
- **AND** it SHALL NOT modify an unrelated same-title page

#### Scenario: Create fails for another bad request
- **WHEN** a destination returns `400` for a reason that is not classified as a duplicate title
- **THEN** the system SHALL preserve that error and SHALL NOT retry it with alternate titles

#### Scenario: Collision recovery succeeds
- **WHEN** a deterministic alternate title is created and verified
- **THEN** state and reports SHALL retain the actual destination title and the migration SHALL continue with the page's descendants, resources, and comments without requiring `--fresh`

### Requirement: Causal transfer outcome lifecycle
The system SHALL distinguish attempted failures, dependency-blocked work, interrupted work, and dry-run plans for every selected page, transferable resource, and enabled comment archive.

#### Scenario: Dry-run finishes
- **WHEN** a dry-run plans an object without destination mutation
- **THEN** that object's outcome SHALL be `planned`

#### Scenario: Live prerequisite fails
- **WHEN** a page cannot be created, reconciled, or verified and a descendant depends on that destination parent
- **THEN** the descendant and its resources and comment archive SHALL be `blocked`, SHALL identify the upstream page and cause, and SHALL NOT be attempted under another parent

#### Scenario: Live run is interrupted before an object starts
- **WHEN** a live run terminates before an independent object begins processing
- **THEN** the object's outcome SHALL be `not-started` rather than `planned`, `failed`, or `complete`

#### Scenario: Live run reaches a normal terminal result
- **WHEN** a non-dry-run finishes as completed, completed-with-warnings, partial, or failed
- **THEN** no page, resource, or comment outcome SHALL remain `planned`

#### Scenario: Blocked state is resumed
- **WHEN** the upstream cause is resolved on a repeated run with the same state
- **THEN** blocked pages and their objects SHALL be retried in top-down order without duplicate destination objects

### Requirement: Causal issue accounting
The system SHALL count root operation errors independently from objects blocked by those errors and SHALL expose the same causal totals in terminal output, state run metadata, report JSON/HTML, and the report catalog.

#### Scenario: One failed parent blocks a subtree
- **WHEN** one page failure prevents several descendants and resources from starting
- **THEN** the report SHALL count one root error and separate dependent page, resource, and comment block totals instead of counting every blocked object as an independent error

#### Scenario: Blocked object is inspected
- **WHEN** an operator inspects a blocked page, resource, or comment archive
- **THEN** the report SHALL identify the upstream page, stable cause code, readable reason, and action to rerun after resolving the root cause

#### Scenario: Outcome surfaces are compared
- **WHEN** terminal, state, report JSON/HTML, and `reports list` are compared
- **THEN** their source totals, exclusive outcome totals, root errors, dependent blocks, and transferred-byte totals SHALL agree

### Requirement: Contextual raw fallback diagnostics
The system SHALL describe the source construct or renderer condition that caused a raw fallback when that context can be determined without exposing source content.

#### Scenario: Preferred renderer returns an empty body
- **WHEN** normalized content is non-empty but preferred rendering produces an empty body
- **THEN** the page SHALL retain its complete raw fallback and partial status while the issue identifies the recognized construct category or renderer condition rather than only a generic failure

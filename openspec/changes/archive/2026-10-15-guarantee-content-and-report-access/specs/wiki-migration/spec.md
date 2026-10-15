# Spec Delta

## ADDED Requirements

### Requirement: Source-derived remote page creation
Every newly created remote page SHALL contain a complete source-derived body or a readable raw-content fallback from its first persisted version and SHALL NOT contain a transfer-progress placeholder.

#### Scenario: Destination mappings are not yet available
- **WHEN** a selected page must be created before all destination page IDs and attachments exist
- **THEN** its bootstrap body SHALL contain all available source content while unresolved internal pages and resources remain usable source references or explicit readable fallbacks

#### Scenario: Renderer cannot produce the preferred representation
- **WHEN** preferred destination rendering fails for a source page before creation
- **THEN** the system SHALL use a destination-safe visible representation of the complete raw source and record a degradation instead of creating a progress-only page

### Requirement: Resource-independent page completion
The system SHALL process each resource independently and SHALL persist and verify the page body even when individual resource transfers fail.

#### Scenario: Attachment transfer fails
- **WHEN** downloading, uploading, or verifying one attachment or image fails
- **THEN** other resources and the page body SHALL continue, the failed reference SHALL use its source URL or a readable fallback, and the page SHALL be partial with retryable resource state

#### Scenario: Final refinement fails
- **WHEN** a final body update or optional raw-snapshot upload fails after a source-derived bootstrap body was created
- **THEN** the bootstrap content SHALL remain intact and the page SHALL be partial unless its actual body cannot be verified

### Requirement: Destination content verification
A remote page SHALL be complete or partial only after the destination body is re-read and verified as non-placeholder source-derived content with accounted references and degradations.

#### Scenario: Destination returns incomplete content
- **WHEN** the re-read body is empty, a transfer placeholder, semantically inconsistent with the rendered body, or has unaccounted source data
- **THEN** the page SHALL be failed and the run SHALL exit non-zero with the affected page and report location

#### Scenario: Body succeeds with resource fallback
- **WHEN** the re-read body contains the represented source content but one or more resources use recorded fallbacks
- **THEN** the page SHALL be partial rather than failed or complete

### Requirement: Generated placeholder recovery
The system SHALL repair mapped pages whose current body exactly matches the ywtc-generated transfer placeholder for that source while preserving ordinary conflict protection.

#### Scenario: Unchanged generated placeholder is resumed
- **WHEN** a mapped destination page still contains the exact generated placeholder and retains its expected mapped title
- **THEN** a rerun SHALL replace it with source-derived content without creating a duplicate page

#### Scenario: Destination was edited manually
- **WHEN** the destination title or body differs from both the stored fingerprint and the exact generated placeholder
- **THEN** the system SHALL report a conflict and SHALL NOT overwrite the page

### Requirement: Terminal report access
The CLI SHALL expose safe report listing and opening commands and SHALL print a clickable local URL whenever a run produces an HTML report.

#### Scenario: Transfer report is produced
- **WHEN** a migration finishes as completed, partial, failed, cancelled, or interrupted and an HTML report was written
- **THEN** terminal output SHALL include its filesystem path and `file://` URL, and `--open-report` SHALL attempt to open it without changing the migration result if opening fails

#### Scenario: Reports are listed
- **WHEN** the operator runs `ywtc reports list`
- **THEN** valid report bundles SHALL be listed newest first with run ID, time, direction, scope, status, page counts, issue counts, and path while malformed bundles are skipped with a warning

#### Scenario: A report is opened
- **WHEN** the operator runs `ywtc reports open [run-id]`
- **THEN** the requested valid report or latest valid report when omitted SHALL open through the operating system without permitting path traversal outside the selected workdir

#### Scenario: Report cannot be opened
- **WHEN** no valid report exists, the run ID is invalid, or the operating system opener fails
- **THEN** the command SHALL fail with an actionable redacted diagnostic and print the local URL when one is available

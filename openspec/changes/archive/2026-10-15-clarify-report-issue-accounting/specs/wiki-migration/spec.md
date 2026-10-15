# Spec Delta

## MODIFIED Requirements

### Requirement: Unified migration issue accounting
The system SHALL derive terminal summaries, state run counters, report metadata, HTML presentation, and report catalog counts from one deduplicated issue collection.

#### Scenario: Operation is retried
- **WHEN** one resource or page operation emits the same issue during retries or fallback handling
- **THEN** the report SHALL count the issue once per code and affected object while retaining retryability and final outcome

#### Scenario: Report counters are inspected
- **WHEN** an operator compares terminal output, state, JSON/HTML report, and `reports list`
- **THEN** warning and error counts SHALL agree, warning counts SHALL exclude separately counted degradations and safe normalizations, and all views SHALL distinguish those categories plus retryable failures

#### Scenario: Resource bytes are reported
- **WHEN** resource metadata is absent or inaccurate but a file is downloaded or verified
- **THEN** byte totals SHALL use the actual persisted size and represent unavailable sizes as unknown rather than zero

### Requirement: Reconciled source-to-outcome reporting
Every run report SHALL distinguish the accessible content selected from the source from the outcome produced for each selected page and transferable resource. Counts in HTML, JSON, terminal summaries, and the report catalog MUST use the same definitions and reconcile without silently treating unknown or unprocessed objects as successful.

#### Scenario: Source scope inventory completes
- **WHEN** discovery and inventory complete for the selected scope
- **THEN** the report SHALL identify that scope as accessible selected source content and count pages, attachments, images, grids, known bytes, unknown sizes, links, tables, and code blocks before presenting transfer outcomes

#### Scenario: Page and resource outcomes are reconciled
- **WHEN** a run finishes in any terminal status
- **THEN** every selected page and transferable resource SHALL appear in exactly one current outcome status, the status totals SHALL equal the corresponding source totals, and unprocessed, blocked, conflicted, partial, or failed objects SHALL NOT be counted as complete

#### Scenario: Transferred bytes are reported
- **WHEN** resources have complete, partial, failed, planned, or unknown outcomes
- **THEN** transferred bytes SHALL include only resources confirmed complete, source bytes SHALL use verified downloaded size when available or source metadata otherwise, and unknown sizes SHALL remain explicitly unknown

#### Scenario: Inventory is incomplete
- **WHEN** source discovery or inventory fails before every selected object is inspected
- **THEN** the report SHALL retain every source page known at that point, identify which inventory values are incomplete, and SHALL NOT represent missing measurements as successful zero counts

#### Scenario: Existing state is analyzed in dry-run
- **WHEN** a dry-run loads earlier page or resource mappings and current validation produces planned, blocked, conflicted, or failed outcomes
- **THEN** the report SHALL show the current dry-run outcome for every object, SHALL NOT restore an earlier successful status, and SHALL report zero transferred bytes

# Spec Delta

## ADDED Requirements

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

### Requirement: Actionable report problem context
The report SHALL make blocking errors, retryable failures, degradations, warnings, and safe normalizations distinguishable and SHALL identify the affected page or resource whenever that context is known.

#### Scenario: Operator opens a report with problems
- **WHEN** the report contains an error, conflict, resource fallback, retryable failure, or degradation
- **THEN** a needs-attention summary SHALL appear before the page tree with severity, phase, reason, retryability, occurrence count, affected page title, affected resource name when applicable, and navigation to page details

#### Scenario: Operator inspects a page
- **WHEN** a selected page is expanded in the HTML report
- **THEN** it SHALL show its exact status, parent/depth, source and destination references, content metrics, resource outcomes and sizes, page-specific issues, fallbacks, normalizations, and available source/destination previews

#### Scenario: Link traversal was not collected
- **WHEN** page or subtree scope has content links but no linked-scope traversal edges
- **THEN** the report SHALL explain that traversal edges were not collected for that scope while retaining source link metrics, rather than presenting an unexplained empty graph

#### Scenario: Report views are compared
- **WHEN** an operator compares HTML, downloadable JSON, terminal completion output, and `reports list`
- **THEN** source page totals, exclusive page outcomes, resource outcomes, and warning/error counts SHALL agree

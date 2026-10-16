# Spec Delta

## MODIFIED Requirements

### Requirement: Source and destination comparison summary
The report SHALL present a concise reconciled comparison of source inventory and destination outcomes for pages, files, comments, and bytes before the hierarchy.

#### Scenario: Summary is inspected
- **WHEN** an operator opens a completed, partial, failed, interrupted, or dry-run report
- **THEN** one table SHALL show non-zero source discovered, selected, excluded, known, and unknown counts beside non-zero exclusive destination outcomes and verified transferred bytes
- **AND** the table SHALL omit visible column headings while retaining screen-reader labels for the metric, source, and destination cells
- **AND** an entirely empty optional category SHALL be omitted

#### Scenario: Non-complete outcomes exist
- **WHEN** any page, file, or comment archive is not complete
- **THEN** the summary SHALL identify each outcome with text, iconography, and contrast rather than color alone

### Requirement: Object-specific report details
The report SHALL expose a keyboard-accessible per-page detail dialog with overview, files, comments, comparison, and issues views tied to typed object diagnostics.

#### Scenario: Page details are opened
- **WHEN** an operator activates a page row or its view control
- **THEN** the dialog SHALL identify source and destination references, source and destination parents, outcome, non-zero metrics, resources, comments, previews, and causal issues for that page
- **AND** definition data SHALL appear as flat labelled rows rather than nested cards

#### Scenario: Resource failure is inspected
- **WHEN** an image, attachment, or comment attachment is incomplete
- **THEN** the files view SHALL identify its source and destination names, kind, size, hash when available, outcome, affected reference, exact redacted reason, and corrective action

#### Scenario: Comment failure is inspected
- **WHEN** a comment thread, entry, archive, or ZIP has a problem
- **THEN** the comments view SHALL identify the affected non-secret comment metadata, outcome, exact redacted reason, and corrective action without placing complete comment bodies in downloadable JSON

#### Scenario: Causal issue is inspected
- **WHEN** a failed or conflicted object blocks dependent work
- **THEN** the issues view SHALL group dependent objects under the root cause and expose category, phase, retryability, occurrence count, and action
- **AND** technical diagnostics SHALL appear as flat expandable rows rather than nested cards

### Requirement: Compact unified report overview
The report SHALL place the illustration, status, time, source-to-destination comparison, ordered canonical metadata, and JSON download in one flat top-level section before the hierarchy.

#### Scenario: Overview is inspected
- **WHEN** an operator opens a generated report
- **THEN** the overview SHALL contain the illustration, status, time, non-zero page/file/comment/byte/quality comparison, and `report.json` download
- **AND** its metadata SHALL appear exactly in the order `RUN ID`, `STATE`, `SOURCE`, `DESTINATION`
- **AND** safe canonical source and destination URLs SHALL be active links while missing or unsafe values SHALL render as plain text
- **AND** Run ID SHALL appear only in that metadata block

#### Scenario: Compact report structure is checked
- **WHEN** the report application renders
- **THEN** it SHALL retain a hidden accessible H1 but SHALL NOT visibly render the report title, the provider/profile/scope/status-mode line, a progress bar, a completed-pages percentage, visible comparison-table headings, or an open-result button
- **AND** it SHALL NOT render standalone summary, root-causes, outputs, or local-report disclaimer sections

#### Scenario: Detailed diagnostics are inspected
- **WHEN** the run contains errors, blocked dependencies, degradations, or normalizations
- **THEN** the operator SHALL inspect them from highlighted hierarchy rows and the affected page's problem details without a separate root-causes panel

#### Scenario: Overview and hierarchy surfaces are checked
- **WHEN** the report application renders its main document
- **THEN** the overview and hierarchy SHALL be flat sections on the page background without card-style outer containers
- **AND** the modal SHALL remain available as the distinct interaction surface for page details

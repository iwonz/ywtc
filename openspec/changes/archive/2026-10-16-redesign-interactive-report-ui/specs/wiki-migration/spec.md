# Spec Delta

## ADDED Requirements

### Requirement: Offline interactive report dashboard
Every new HTML report SHALL provide a self-contained interactive dashboard that works from `file://` without fetching application code, styles, fonts, telemetry, or report data from a network service.

#### Scenario: Report is opened offline
- **WHEN** an operator opens a generated `index.html` without network access
- **THEN** the summary, filters, hierarchy, details, previews, localization, and themes SHALL remain usable

#### Scenario: Source or destination link is activated
- **WHEN** an operator explicitly activates a source or destination link
- **THEN** the browser MAY navigate to that external location without the report making background requests beforehand

### Requirement: Source and destination comparison summary
The report SHALL present a concise reconciled comparison of source inventory and destination outcomes for pages, files, comments, and bytes before the hierarchy.

#### Scenario: Summary is inspected
- **WHEN** an operator opens a completed, partial, failed, interrupted, or dry-run report
- **THEN** one table SHALL show source discovered, selected, excluded, known, and unknown counts beside exclusive destination outcomes and verified transferred bytes

#### Scenario: Non-complete outcomes exist
- **WHEN** any page, file, or comment archive is not complete
- **THEN** the summary SHALL identify each outcome with text, iconography, and contrast rather than color alone

### Requirement: Unified report hierarchy
The report SHALL present selected and excluded source pages in one searchable, filterable hierarchy while keeping exclusion distinct from a destination failure.

#### Scenario: Hierarchy is first displayed
- **WHEN** the report contains page nodes
- **THEN** all known branches SHALL be expanded, preserve source placement when known, and expose controls to collapse branches

#### Scenario: Problem filter is applied
- **WHEN** an operator filters by a problem outcome or searches for an object
- **THEN** matching pages and their ancestors SHALL remain visible while unrelated branches are hidden

#### Scenario: Source-status exclusion is present
- **WHEN** an accessible page was excluded by source-status filtering
- **THEN** it SHALL appear at its known source position with an excluded outcome and reason and SHALL NOT count as a destination error

#### Scenario: Excluded placement is unknown
- **WHEN** a provider cannot expose enough metadata to place an excluded page
- **THEN** the report SHALL place it in an explicit unknown-position group with its source locator and reason

### Requirement: Object-specific report details
The report SHALL expose a keyboard-accessible per-page detail dialog with overview, files, comments, comparison, and issues views tied to typed object diagnostics.

#### Scenario: Page details are opened
- **WHEN** an operator activates a page row or its view control
- **THEN** the dialog SHALL identify source and destination references, source and destination parents, outcome, metrics, resources, comments, previews, and causal issues for that page

#### Scenario: Resource failure is inspected
- **WHEN** an image, attachment, or comment attachment is incomplete
- **THEN** the files view SHALL identify its source and destination names, kind, size, hash when available, outcome, affected reference, exact redacted reason, and corrective action

#### Scenario: Comment failure is inspected
- **WHEN** a comment thread, entry, archive, or ZIP has a problem
- **THEN** the comments view SHALL identify the affected non-secret comment metadata, outcome, exact redacted reason, and corrective action without placing complete comment bodies in downloadable JSON

#### Scenario: Causal issue is inspected
- **WHEN** a failed or conflicted object blocks dependent work
- **THEN** the issues view SHALL group dependent objects under the root cause and expose category, phase, retryability, occurrence count, and action

### Requirement: Safe localized report presentation
The report SHALL support Russian and English, system/light/dark themes, responsive layouts, and safe rendering of untrusted source-derived metadata and previews.

#### Scenario: Report language is selected
- **WHEN** no report-language preference exists
- **THEN** the interface SHALL select Russian for a Russian browser locale and English otherwise and SHALL allow a remembered manual override

#### Scenario: Report theme is selected
- **WHEN** no report-theme preference exists
- **THEN** the interface SHALL follow the operating-system theme and SHALL allow a remembered light or dark override

#### Scenario: Source-derived content is malicious or malformed
- **WHEN** titles, diagnostics, resource names, URLs, or preview bodies contain active markup or script-like content
- **THEN** interface text SHALL be escaped, unsafe URLs SHALL not become active links, and previews SHALL remain isolated in sandboxed frames

#### Scenario: Metadata is downloaded
- **WHEN** report JSON is downloaded
- **THEN** it SHALL retain typed counts, outcomes, object references, and redacted diagnostics but SHALL exclude credentials, email, full page bodies, full comment bodies, and preview HTML

### Requirement: Scalable accessible report navigation
The report SHALL remain operable with keyboard and assistive technology and SHALL bound rendered hierarchy work for large source graphs.

#### Scenario: Keyboard navigation is used
- **WHEN** an operator navigates rows, controls, tabs, tooltips, or the dialog without a pointer
- **THEN** focus order, labels, activation, focus trapping, dismissal, and tree expansion SHALL be available through standard keyboard interactions

#### Scenario: Large hierarchy is opened
- **WHEN** a report contains ten thousand page nodes
- **THEN** search, filtering, branch expansion, and detail opening SHALL remain responsive by rendering only the visible hierarchy window without changing logical totals

# Spec Delta

## ADDED Requirements

### Requirement: Compact report presentation
The interactive report SHALL prioritize non-zero outcomes, actionable diagnostics, and transfer completeness while omitting empty metrics and controls whose absence is unambiguous.

#### Scenario: Overview contains zero-valued optional metrics
- **WHEN** a report has no excluded pages, failures, conflicts, comments, attachments, or other optional metric values
- **THEN** the overview SHALL omit those zero-value counters instead of rendering repeated `0` labels
- **AND** it SHALL retain the total pages, overall status, progress, direction, source, destination, and report identity needed to understand the run

#### Scenario: A non-zero outcome requires attention
- **WHEN** a page, resource, comment archive, quality category, or inventory dimension has a non-zero outcome
- **THEN** the report SHALL display that metric with its semantic label and visual impact treatment
- **AND** the hierarchy and details view SHALL expose the affected object and available corrective action

#### Scenario: Page details contain empty sections
- **WHEN** a page has no resources, comments, preview, conflicts, or issues for an optional detail category
- **THEN** the details interface SHALL omit the empty category or present one concise empty state only when the absence itself is useful
- **AND** it SHALL NOT repeat zero counters, placeholder definition rows, or unavailable identifiers across the view

#### Scenario: Offline report interactions are used
- **WHEN** a generated report is opened through `file://` on desktop or mobile
- **THEN** summary, hierarchy, search, problem filters, page details, preferences, JSON download, and sandboxed comparison SHALL remain usable without network requests
- **AND** the interface SHALL retain keyboard navigation, focus management, accessible names, light/dark themes, RU/EN localization, and large-tree virtualization

#### Scenario: UI dependencies are inspected
- **WHEN** project dependencies and report source are reviewed
- **THEN** the report SHALL use one maintained component system rather than a parallel custom shadcn-style primitive layer
- **AND** report-only Radix, Tailwind, CVA, clsx, and tailwind-merge dependencies SHALL be absent

## MODIFIED Requirements

### Requirement: Compact report presentation
The interactive report SHALL prioritize non-zero outcomes, actionable diagnostics, and transfer completeness in a flat document layout while omitting empty metrics and redundant controls.

#### Scenario: Overview contains zero-valued optional metrics
- **WHEN** a report has no excluded pages, failures, conflicts, comments, attachments, or other optional metric values
- **THEN** the overview SHALL omit those zero-value counters and any resulting empty category
- **AND** it SHALL retain the total pages, overall status, canonical source and destination, and report identity needed to understand the run
- **AND** an unavailable required inventory value SHALL use a concise textual empty state rather than a numeric zero

#### Scenario: A non-zero outcome requires attention
- **WHEN** a page, resource, comment archive, quality category, or inventory dimension has a non-zero outcome
- **THEN** the report SHALL display that metric with its semantic label and visual impact treatment
- **AND** the hierarchy and details view SHALL expose the affected object and available corrective action

#### Scenario: Main report layout is inspected
- **WHEN** the report overview and hierarchy render
- **THEN** they SHALL use flat sections, spacing, and separators without outer cards, borders, shadows, blur, rounded islands, or a separate tree container
- **AND** complete hierarchy rows SHALL remain transparent while non-complete rows MAY use a light full-width semantic tint
- **AND** the functional modal MAY remain a distinct overlay surface

#### Scenario: Page details contain empty sections
- **WHEN** a page has no resources, comments, preview, conflicts, or issues for an optional detail category
- **THEN** the details interface SHALL omit the empty category or present one concise empty state only when the absence itself is useful
- **AND** it SHALL NOT repeat zero counters, placeholder definition rows, or unavailable identifiers across the view
- **AND** definition data and technical diagnostics SHALL use flat lists rather than nested tiles

#### Scenario: Offline report interactions are used
- **WHEN** a generated report is opened through `file://` on desktop or mobile
- **THEN** summary, hierarchy, search, problem filters, page details, preferences, JSON download, and sandboxed comparison SHALL remain usable without network requests
- **AND** the interface SHALL retain keyboard navigation, focus management, accessible names, light/dark themes, RU/EN localization, and large-tree virtualization

#### Scenario: UI dependencies are inspected
- **WHEN** project dependencies and report source are reviewed
- **THEN** all interactive operator interfaces SHALL use shared local shadcn/ui components and semantic design tokens
- **AND** Mantine dependencies, providers, hooks, selectors and variables SHALL be absent from active frontend sources and package dependencies

## ADDED Requirements

### Requirement: Shared operator interface system
The control center, offline reports and mention/hashtag editors SHALL use a common shadcn/ui component system. Existing workflows, flat presentation, nonzero metrics, themes, localization, keyboard support, virtualization and security boundaries SHALL remain available.

#### Scenario: Operator changes interface surfaces
- **WHEN** the operator uses the control center, a generated report or either decision editor
- **THEN** controls SHALL use shared components, theme tokens and consistent focus/error/disabled states without a parallel Mantine implementation

#### Scenario: Dialog and choice controls are used
- **WHEN** the operator opens dialogs, changes tabs, selects values or dismisses an overlay with Escape
- **THEN** accessible labels, keyboard behavior, focus containment and return SHALL remain functional on desktop and mobile

#### Scenario: Autonomous bundle is opened
- **WHEN** a new report or editor is opened using file:// from the installed package
- **THEN** scripts, CSS, fonts and components SHALL load locally without background requests and previews SHALL remain sandboxed

#### Scenario: Presentation is validated
- **WHEN** project and package checks run
- **THEN** checks SHALL cover each surface, both themes, responsive overflow, unsafe data, strict visual baselines and absence of Mantine dependencies without changing migration or JSON contracts

### Requirement: Verified runtime dependency handoff
Published artifacts SHALL retain security-critical runtime dependency substitutions proved by repository checks. Installed-package verification SHALL inspect actual resolved dependencies rather than assume root-only override policies propagate to consumers.

#### Scenario: A transitive security fix is packaged
- **WHEN** an audited replacement is required for a legacy runtime dependency
- **THEN** isolated installation SHALL resolve the replacement and verify its called API and content behavior before publication


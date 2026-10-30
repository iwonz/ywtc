## MODIFIED Requirements

### Requirement: Recognizable work area navigation
The control center SHALL provide an expandable workspace sidebar, thematic labeled work areas, an explicit active state, localized guidance and a visible new-migration action. Its wordmark SHALL read ywtc without a trailing underscore or migration-center caption. The layout SHALL remain flat and usable by keyboard on narrow and wide screens.

#### Scenario: Operator switches work area
- **WHEN** an operator selects connections, reports, tasks, synchronization or mentions and hashtags
- **THEN** the selected button SHALL expose its active state beyond color, retain an accessible name and show relevant guidance
- **AND** decorative icons SHALL NOT duplicate the accessible button name

#### Scenario: Viewport or theme changes
- **WHEN** the application is viewed in light or dark theme on desktop or mobile
- **THEN** navigation, workspace controls and new-migration actions SHALL remain usable without horizontal page overflow
- **AND** operation semantics and the absence of external UI requests SHALL remain unchanged

#### Scenario: Workspace navigation is collapsed
- **WHEN** the operator collapses or expands the sidebar
- **THEN** workspace controls SHALL remain in that sidebar, icon controls SHALL retain accessible labels and keyboard help, and expansion preference SHALL survive reload without storing private form data
- **AND** navigation SHALL order connections before migrations/reports, tasks, synchronization and mentions/hashtags; decorative header/sidebar rules SHALL be absent

#### Scenario: Project repository is opened
- **WHEN** the operator activates the header GitHub link
- **THEN** the official project repository SHALL open in a new tab with opener isolation and no background prefetch

#### Scenario: Report reference is activated
- **WHEN** an eligible HTTP(S) source, destination or file reference icon is activated
- **THEN** it SHALL act as a native isolated new-tab link without opening the row dialog; missing or unsafe references SHALL remain disabled

## ADDED Requirements

### Requirement: Guided operation forms
Forms SHALL distinguish required input from optional settings, group prerequisites before advanced options and confirmed actions, and expose concise accessible explanations. Scope descriptions SHALL match CLI page/space behavior. Submission SHALL require valid visible prerequisites and fresh live confirmation.

#### Scenario: Migration scope is selected
- **WHEN** the migration or source-only analysis form is opened
- **THEN** each scope option SHALL explain its page/space meaning, source-status filtering SHALL explain the explicit-root exception, and default values SHALL remain unchanged

#### Scenario: Parameters change after live confirmation
- **WHEN** migration parameters change after the operator confirms live writes
- **THEN** confirmation SHALL be cleared before another live submission, while dry-run remains the initial mode

#### Scenario: Dry-run reports blocking errors
- **WHEN** a dry-run task has a failed, partial, cancelled or interrupted run result
- **THEN** its continuation UI SHALL explain that issues require review and SHALL NOT offer a live confirmation based on that result

#### Scenario: Field guidance is requested
- **WHEN** an operator hovers, focuses or activates an information control
- **THEN** its explanation SHALL be accessible without replacing the field label, and required fields and visible descriptions SHALL be programmatically associated with their controls

### Requirement: Operational help and truthful progress
The UI SHALL offer local workflow/status help distinguishing job lifecycle, migration results, object outcomes and retryability. Task guidance SHALL use confirmed job/progress evidence, identify the current phase and avoid inferred success, failure or percentages when evidence is unavailable.

#### Scenario: Task has no measured total
- **WHEN** a task is queued, has no first progress snapshot or reports an unknown total
- **THEN** the UI SHALL explain the current known state without a fabricated percentage or assumption of completion

#### Scenario: Operator consults statuses
- **WHEN** status help is opened
- **THEN** it SHALL distinguish finished jobs from successful migrations, explain incomplete and excluded objects with next actions, and preserve the README as the exhaustive status contract

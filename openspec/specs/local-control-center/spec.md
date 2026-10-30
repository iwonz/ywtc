# local-control-center Specification

## Purpose
Provide a private local operator application for configuration, durable jobs, migration evidence and explicit corrective actions.

## Requirements

### Requirement: Packaged loopback application
The CLI SHALL expose ui with workdir, port default 3000 and no-open, serve only 127.0.0.1, open the browser by default and report an occupied port without stopping another process. Closing the application SHALL NOT stop accepted jobs.

#### Scenario: Installed application starts
- **WHEN** ui starts from the installed package
- **THEN** all required UI assets SHALL be local, configuration defaults SHALL match CLI, and ordinary CLI commands SHALL NOT load the web runtime

### Requirement: Authenticated local access
The application SHALL exchange a single-use fragment bootstrap secret for an HttpOnly SameSite session, validate Host/Origin, deny CORS and keep credentials out of browser responses, logs and persisted job requests.

#### Scenario: Untrusted browser origin sends a request
- **WHEN** an untrusted origin or invalid session accesses the application API
- **THEN** the request SHALL be rejected without revealing workspace contents or causing mutation

### Requirement: Explicit filesystem and preview boundaries
Only registered workspaces and explicitly selected export roots SHALL be accessible through realpath-aware bounded routes. Source markup and historical report applications SHALL NOT execute in the control-center origin.

#### Scenario: Imported content or path is unsafe
- **WHEN** a request contains traversal, a symlink escape or executable preview content
- **THEN** the path SHALL be rejected or the preview isolated without changing provider or application data

### Requirement: Operator workflows
The application SHALL expose workspace/profile setup, dry-run-first migration, task queue/progress/logs, state-grouped run history, read-only mappings/checkpoints, report hierarchy/details and decisions workflows with compact nonzero presentation, RU/EN, themes, keyboard access and large-list virtualization.

#### Scenario: Existing evidence is inspected
- **WHEN** an operator opens an old or incomplete report/state
- **THEN** available evidence SHALL remain readable, missing capabilities SHALL have precise reasons, and no guessed retry parameters or false success SHALL be produced

#### Scenario: Live mutation is requested
- **WHEN** an operator starts a live migration or selective correction
- **THEN** it SHALL require explicit confirmation, preserve dry-run's no-destination-write boundary and expose the final shared report

### Requirement: Synchronization review
The local application SHALL expose run-bound synchronization analysis, optional subtree selection, searchable change classification, source/destination diff, eligible decisions, Keep continuity, incoming link patches and explicit application through shared jobs. Decision edits SHALL use revision checks.

#### Scenario: Operator reviews a change
- **WHEN** analysis finds additions, changed objects or an unknown baseline
- **THEN** the UI SHALL show the reason, affected resources/comments, actual destination and proposed representation, and SHALL disable apply until required decisions and evidence are complete

#### Scenario: Trash is chosen
- **WHEN** an eligible leaf receives a Trash decision
- **THEN** the UI SHALL show incoming-reference effects and require a separate explicit trash confirmation; unsupported or unproved actions SHALL stay disabled

#### Scenario: Two tabs edit a plan
- **WHEN** a decision update uses a stale revision
- **THEN** the server SHALL reject it without overwriting the current document and the UI SHALL request a refresh

### Requirement: Recoverable configuration interface
Invalid workspace configuration SHALL remain repairable in the local interface. The application SHALL distinguish schema diagnostics from unreadable YAML, preserve credential masking, and keep repair drafts separate from the active configuration until explicit validated application.

#### Scenario: Operator fixes several incomplete profiles
- **WHEN** initial settings contain multiple invalid fields
- **THEN** the operator SHALL be able to stage profile edits, remove unwanted draft profiles, adjust supported policies/defaults/limits, and apply the complete repair without a CLI handoff

#### Scenario: Configuration remains invalid
- **WHEN** a repair draft still violates the current schema
- **THEN** precise field diagnostics SHALL remain actionable and no configuration replacement or provider operation SHALL occur

#### Scenario: Migration form opens before repair
- **WHEN** the active configuration is schema-invalid
- **THEN** migration submission SHALL remain disabled with guidance to complete settings first

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
- **AND** navigation SHALL order connections before migrations/reports, tasks, synchronization and mentions/hashtags; decorative header/sidebar rules and the redundant local-folder caption SHALL be absent

#### Scenario: Project repository is opened
- **WHEN** the operator activates the rightmost header control
- **THEN** its genuine GitHub mark SHALL identify the official project repository, which SHALL open in a new tab with opener isolation and no background prefetch

#### Scenario: Report reference is activated
- **WHEN** an eligible HTTP(S) source, destination or file reference icon is activated
- **THEN** it SHALL act as a native isolated new-tab link without opening the row dialog; missing or unsafe references SHALL remain disabled

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

### Requirement: Resilient action composition
Visible text action buttons SHALL pair a thematic leading icon with a readable label. Labels, icons, loading indicators and focus affordances SHALL fit their container in either locale without clipping or horizontal page overflow. Existing icon-only controls and semantic selection controls SHALL retain their established accessible interaction.

#### Scenario: Long localized action is shown in a narrow container
- **WHEN** an action such as workspace connection is rendered in a narrow sidebar, toolbar or modal
- **THEN** its icon SHALL remain to the left of the complete readable label, its hit target SHALL grow or wrap appropriately, and tooltips SHALL NOT invalidate its layout styles

#### Scenario: Actions are operated by keyboard
- **WHEN** the operator focuses, activates or disables an action
- **THEN** its accessible name, focus indication and existing confirmation requirements SHALL remain intact; decorative icons SHALL be hidden from assistive naming

#### Scenario: Long data labels share a row
- **WHEN** page titles, profile names or other unbroken data labels share a row with action controls and status indicators
- **THEN** text actions SHALL yield available width and wrap, icons SHALL remain legible and row content SHALL stay within the page at supported desktop/mobile widths in both locales

### Requirement: Illustrated empty work areas
Successfully loaded empty connections, reports, tasks, synchronization and mention/hashtag areas SHALL display distinct local project-style illustrations, localized explanations and an appropriate next action. Empty pagination SHALL be absent. Missing data SHALL NOT be presented as completed work or hide errors.

#### Scenario: Workspace has no objects in the selected area
- **WHEN** a successful collection read returns no objects
- **THEN** the corresponding themed empty state SHALL explain what belongs there and offer a safe existing setup, analysis or navigation action without automatically starting a migration
- **AND** illustrations SHALL be bundled, noninteractive, decorative, transparent and legible in light/dark themes and narrow layouts without external requests

#### Scenario: Collection has not been successfully read
- **WHEN** a collection is still loading or its request fails
- **THEN** the UI SHALL show loading or actionable error evidence rather than a successful empty-state illustration

#### Scenario: Filter has no matches
- **WHEN** existing data does not match a search or filter
- **THEN** the UI SHALL explain the lack of matches separately from an empty workspace and offer a way to clear the filter without changing stored data

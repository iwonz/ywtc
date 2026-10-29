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
The control center SHALL provide labeled work areas with thematic leading icons, an explicit active state, concise localized guidance and a visible new-migration action. Its wordmark SHALL read ywtc without a trailing underscore. The layout SHALL remain flat and usable by keyboard on narrow and wide screens.

#### Scenario: Operator switches work area
- **WHEN** an operator selects reports, tasks, decisions, synchronization or connections
- **THEN** the selected button SHALL expose its active state beyond color, retain a readable label and show guidance relevant to that work area
- **AND** decorative icons SHALL NOT duplicate the accessible button name

#### Scenario: Viewport or theme changes
- **WHEN** the application is viewed in light or dark theme on desktop or mobile
- **THEN** navigation labels, workspace controls and the new-migration action SHALL remain usable without horizontal page overflow
- **AND** the desktop navigation rail SHALL adapt to a labeled mobile arrangement without changing operation semantics or introducing external UI requests

## MODIFIED Requirements

### Requirement: Safe conflicts and reruns
The system SHALL use stable title suffixes for collisions, SHALL automatically select isolated resumable state under `.states/` for each canonical source-target pair unless explicitly overridden, and SHALL persist enough state to resume or rerun without duplicating previously mapped content.

#### Scenario: Duplicate title
- **WHEN** a source title conflicts with another source page or an existing destination-space title
- **THEN** the system SHALL choose a deterministic suffixed title and record the rename

#### Scenario: Interrupted migration
- **WHEN** a prior current-version run created pages or attachments and then stopped
- **THEN** a rerun with the same canonical source and target SHALL find `.states/<state-id>.json` and update those mapped objects instead of creating duplicates

#### Scenario: Equivalent input forms
- **WHEN** repeated runs identify the same resolved Yandex page and Confluence target through different supported slug, ID, or URL forms
- **THEN** the system SHALL derive the same automatic state identifier without including credentials

#### Scenario: Independent migrations
- **WHEN** the source page, Yandex organization, Yandex instance, Confluence instance, Confluence space, or Confluence target page differs
- **THEN** the system SHALL select a different automatic state file and SHALL NOT overwrite the other migration's state

#### Scenario: Explicit state override
- **WHEN** the operator supplies a non-empty `--state` path
- **THEN** the system SHALL use exactly that path and SHALL reject a valid state belonging to another source-target identity with corrective guidance

#### Scenario: Clean live run
- **WHEN** the operator supplies `--fresh` for a live migration
- **THEN** the system SHALL ignore prior mappings, preserve an existing selected state as a recoverable backup, start an empty selected state, and warn that destination duplicates or suffixed titles may result

#### Scenario: Clean dry-run
- **WHEN** the operator combines `--fresh` with `--dry-run`
- **THEN** the system SHALL analyze with empty in-memory mappings without creating, moving, backing up, or updating a state file

#### Scenario: Invalid state data
- **WHEN** a selected state file is unreadable, malformed, unsupported, or owned by another migration
- **THEN** the system SHALL exit before destination mutations and identify the affected path plus safe recovery actions without revealing credentials

### Requirement: Publication hygiene
The repository and package SHALL contain only organization-neutral source, examples, specifications, and generated library artifacts and SHALL treat `.states/` as the sole ignored automatic runtime root.

#### Scenario: Public release validation
- **WHEN** a maintainer runs the release check before publishing
- **THEN** it SHALL permit ignored local runtime data under `.states/` but fail when that data is tracked by Git, required ignore rules are absent, or publishable files contain private keys, filled credential variables, literal authorization credentials, non-example emails, or absolute user-home paths

### Requirement: Detailed local migration report
The system SHALL create one ignored report directory per run containing a self-contained HTML report and downloadable JSON metadata, without credentials or authorization headers, and SHALL keep report placement stable inside the current runtime state root.

#### Scenario: Report bundle is written
- **WHEN** a dry-run or live migration reaches report generation
- **THEN** the system SHALL write `index.html` and `report.json` under a unique directory in `.states/reports` for automatic state or the explicit state file's sibling `reports` directory

#### Scenario: Migration hierarchy is inspected
- **WHEN** an operator opens the HTML report
- **THEN** the report SHALL show nested source pages with titles, statuses, source and destination references, resource counts and sizes, link/image/table/code metrics, warnings, errors, and stale destination mappings where applicable

#### Scenario: A page comparison is opened
- **WHEN** an operator selects a page in the HTML report
- **THEN** the report SHALL show sandboxed source and destination content previews side by side and identify whether the destination came from Confluence rendered view or a local dry-run fallback

#### Scenario: Metadata is downloaded
- **WHEN** an operator activates the JSON download control
- **THEN** the browser SHALL download the metadata for that report without embedding source or destination page bodies in the JSON

#### Scenario: State selection is audited
- **WHEN** a report is generated
- **THEN** its HTML and JSON metadata SHALL identify the credential-free state ID, selected path, selection mode, current load source, and fresh backup path when applicable

#### Scenario: Runtime privacy is preserved
- **WHEN** reports are generated with the default state location or package files are enumerated
- **THEN** report folders SHALL remain ignored by Git and excluded from package publication

### Requirement: Observable state selection
The system SHALL explain automatic, explicit, existing, new, and fresh state behavior in CLI output and per-run report metadata.

#### Scenario: Automatic state is resolved
- **WHEN** source and target preflight resolve canonical page identities
- **THEN** the CLI SHALL display the selected state identifier and `.states/<state-id>.json` path before destination mutations

#### Scenario: State is reused or backed up
- **WHEN** a run loads current state or a fresh run backs up selected state
- **THEN** the CLI and report SHALL identify the action and relevant non-secret current paths

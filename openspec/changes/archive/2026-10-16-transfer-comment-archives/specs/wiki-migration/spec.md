# Spec Delta

## ADDED Requirements

### Requirement: Configurable page comment transfer
The `migrate` and `doctor` commands SHALL accept `--comments` and `--no-comments`, default comments to enabled, and exclude this choice from canonical automatic state identity.

#### Scenario: Default migration
- **WHEN** the operator omits both comment flags
- **THEN** the system SHALL inventory and transfer accessible page comments

#### Scenario: Explicit disable
- **WHEN** the operator uses `--no-comments`
- **THEN** the system SHALL perform the page transfer without comment API calls and preserve existing comment state and destination objects

#### Scenario: Doctor capability probe
- **WHEN** comments are enabled during `doctor`
- **THEN** source comment readability SHALL be probed without mutation and an inability to prove destination write permission SHALL be reported as a warning rather than a failed preflight

### Requirement: Comment-aware transfer capabilities
Source and destination adapters SHALL declare comment read, create, and update capabilities independently of page and resource capabilities, and preflight SHALL require only those supported by the selected direction and operation.

#### Scenario: Append-only comment destination
- **WHEN** a destination can create but cannot update comments
- **THEN** preflight SHALL permit transfer and reruns SHALL use revision comments rather than destructive replacement

#### Scenario: Unsupported comment read
- **WHEN** the selected source cannot expose page comments and comments are enabled
- **THEN** the system SHALL identify the unavailable capability before page mutation while allowing the operator to rerun with `--no-comments`

### Requirement: Comment-aware progress and state
State and progress SHALL record comment fingerprints, mappings, history, per-page status, counts, known bytes, and last errors as optional page data while retaining current state files that predate those fields.

#### Scenario: Existing state is resumed
- **WHEN** a current state file has page mappings but no comment records
- **THEN** a comments-enabled rerun SHALL add comment state without duplicating mapped pages or requiring `--fresh`

#### Scenario: Progress is displayed
- **WHEN** comment inventory completes
- **THEN** terminal planning and progress SHALL show exact threads, entries, participants, referenced attachments, known bytes, and completed page archives

### Requirement: Reconciled comment outcome reporting
Terminal summaries, state run counters, report JSON/HTML, and the report catalog SHALL derive comment source totals and `complete`, `partial`, `failed`, `conflict`, `stale`, and `skipped` outcomes from one deduplicated record.

#### Scenario: Mixed outcomes
- **WHEN** selected pages include verified archives, an API failure, no comments, a user conflict, and comments disabled on another run
- **THEN** every selected page SHALL reconcile to exactly one comment outcome and issue counts SHALL match across all report surfaces

#### Scenario: Actual destination preview
- **WHEN** an archive comment was created or updated remotely
- **THEN** the report SHALL preview the body read back from destination rather than only the intended render

### Requirement: Non-blocking comment pipeline
Remote transfer SHALL process comments after the corresponding page body and ordinary resources, and a comment-specific failure SHALL not roll back or suppress verified page content.

#### Scenario: Archive upload fails
- **WHEN** a comment ZIP cannot be uploaded
- **THEN** the page body and ordinary resources SHALL remain transferred, comment status SHALL be failed, and overall page status SHALL be partial

#### Scenario: Destination page is recreated
- **WHEN** consistency recovery recreates a mapped destination page
- **THEN** stale comment and comment-archive mappings for the previous page SHALL be reset and rebuilt from verified cache without deleting the old destination objects

# wiki-migration Delta

## ADDED Requirements

### Requirement: Source-authoritative mapped destination updates
The current source SHALL be authoritative for every page whose destination identity is proven by the selected state, while unmapped or ambiguously owned destination objects remain protected.

#### Scenario: Mapped destination differs
- **WHEN** a mapped destination page has a different body, title, provider version, or normalized representation from the last verified run
- **THEN** the system SHALL read the latest object, apply the current source representation as a new destination version, verify it, and SHALL NOT create a duplicate

#### Scenario: Mapped destination is semantically equivalent
- **WHEN** provider-aware comparison finds the latest destination body, meaningful structure, references, and expected hierarchy equivalent to the rendered source
- **THEN** the system SHALL reuse the current object without issuing a content update and SHALL checkpoint the confirmed fingerprint and provider version

#### Scenario: Destination revision is replaced
- **WHEN** a mapped destination revision differs and a verified update succeeds
- **THEN** the system SHALL record `destination-revision-updated` as a safe event without warning, degradation, partial, or conflict status

#### Scenario: Concurrent Confluence revision
- **WHEN** Confluence rejects an update because another revision became current
- **THEN** the system SHALL re-read the newest revision and retry at most three times with jittered backoff based on 0.5, 1, and 2 seconds

#### Scenario: Concurrent revision retries are exhausted
- **WHEN** all bounded latest-version retries fail
- **THEN** the page SHALL be failed and its selected descendants SHALL be causally blocked by the unavailable destination parent

#### Scenario: Ownership is ambiguous
- **WHEN** state and provider evidence cannot prove which existing destination object belongs to the source mapping
- **THEN** the system SHALL preserve every candidate unchanged, mark conflict, and SHALL NOT adopt or overwrite an object

#### Scenario: Earlier conflict state is resumed
- **WHEN** a repeated run loads mapped pages previously marked conflict or blocked only because their destination revision differed
- **THEN** the system SHALL replan them top-down under this authoritative policy without requiring `--fresh`

### Requirement: Confirmed destination revision checkpoints
State SHALL store a mapped destination fingerprint and provider version only from a final successful provider read after creation, update, move, or semantic reuse.

#### Scenario: Mutation response differs from read-back
- **WHEN** a provider normalizes content or advances a version after accepting a mutation
- **THEN** the system SHALL checkpoint the final read-back fingerprint and version rather than the submitted body or immediate mutation response

#### Scenario: Update or read-back fails
- **WHEN** a destination mutation cannot be confirmed by a final read
- **THEN** the system SHALL NOT record its unconfirmed fingerprint or version as verified state

### Requirement: Compact unified report overview
The report SHALL place run identity, progress, source-to-destination comparison, quality totals, paths, result links, and JSON download in one top-level overview before the hierarchy.

#### Scenario: Overview is inspected
- **WHEN** an operator opens a generated report
- **THEN** one overview SHALL contain the illustration, title, status, direction, scope, time, run ID, progress, page/file/comment/byte/quality comparison, destination result, state/report paths, and `report.json` download

#### Scenario: Detailed diagnostics are inspected
- **WHEN** the run contains errors, blocked dependencies, degradations, or normalizations
- **THEN** the operator SHALL inspect them from highlighted hierarchy rows and the affected page's problem details without a separate root-causes panel

#### Scenario: Compact report structure is checked
- **WHEN** the report application renders
- **THEN** it SHALL NOT render standalone summary, root-causes, outputs, or local-report disclaimer sections

### Requirement: Accessible cycling report preferences
The report SHALL expose language and theme as icon-only buttons with visible tooltips, accessible names, deterministic cycling, and remembered preferences.

#### Scenario: Theme control is activated
- **WHEN** the operator activates the theme button
- **THEN** it SHALL cycle `system → light → dark → system`, update Monitor/Sun/Moon iconography, announce current and next modes, and persist the selection when storage is available

#### Scenario: Language control is activated
- **WHEN** the operator activates the language button
- **THEN** it SHALL alternate Russian and English using stable embedded flag SVGs, announce current and next languages, and persist the selection when storage is available

#### Scenario: Preference storage is unavailable
- **WHEN** local storage is inaccessible
- **THEN** both controls SHALL remain keyboard-operable and update the current report session without failing the application

## MODIFIED Requirements

### Requirement: Provider-neutral state and lifecycle
The system SHALL persist canonical endpoint identity, graph edges, confirmed destination fingerprints and versions, page/resource mappings, object statuses, and run lifecycle in one strict current state structure without a schema-version field or compatibility branches.

#### Scenario: Equivalent locators and expanded scope
- **WHEN** repeated runs identify the same endpoints through different supported URL/ID/slug forms or expand the scope
- **THEN** they SHALL select the same automatic state and reuse only valid mapped objects

#### Scenario: Canonical automatic state identity
- **WHEN** an automatic state ID is calculated
- **THEN** it SHALL depend only on canonical source and destination identities, selected profiles, and filesystem format when applicable, and SHALL exclude locator spelling, scope, credentials, and schema labels

#### Scenario: Invalid state structure
- **WHEN** a selected state file is malformed, incomplete, contains unknown fields, or does not match its canonical transfer identity
- **THEN** the system SHALL preserve it unchanged, stop before destination mutation, and report a generic invalid-state error with safe current actions but no conversion behavior

#### Scenario: Destination changed outside ywtc
- **WHEN** a proven mapped destination fingerprint or provider version differs from the last verified value
- **THEN** the system SHALL treat the source as authoritative, update or semantically reuse the mapped object, and preserve prior destination content through provider history without conflict

#### Scenario: Destination ownership is uncertain
- **WHEN** the provider result makes a state mapping ambiguous or unable to prove a unique destination identity
- **THEN** the object SHALL become a conflict and SHALL NOT be overwritten automatically

#### Scenario: Interrupted run
- **WHEN** SIGINT or SIGTERM occurs
- **THEN** the system SHALL stop scheduling, flush atomic state/report data, mark the run cancelled or interrupted, and return the conventional signal exit code

### Requirement: Generated placeholder recovery
The system SHALL repair mapped pages whose current body exactly matches a ywtc-generated transfer placeholder and SHALL otherwise apply the source-authoritative mapped update policy.

#### Scenario: Unchanged generated placeholder is resumed
- **WHEN** a mapped destination page still contains the exact generated placeholder and retains its expected mapped identity
- **THEN** a rerun SHALL replace it with source-derived content without creating a duplicate page

#### Scenario: Destination was edited manually
- **WHEN** the proven mapped destination title or body differs from both the stored fingerprint and the exact generated placeholder
- **THEN** the system SHALL apply the current source-derived title and body as a new verified destination version without conflict

#### Scenario: Placeholder ownership cannot be proven
- **WHEN** ywtc cannot prove that a placeholder or candidate destination page belongs to the selected source mapping
- **THEN** it SHALL preserve the candidate unchanged and report an ownership conflict

### Requirement: Destination hierarchy reconciliation
The system SHALL compare every mapped destination parent with the frozen projected source parent and repair proven mappings top-down independently of destination body revision without deleting destination data.

#### Scenario: Unchanged Confluence page has the wrong parent
- **WHEN** a proven mapped Confluence page has a different parent from the expected mapped parent
- **THEN** the system SHALL move it through the deployment-specific update API, read it back, and require the expected parent before processing descendants

#### Scenario: Mapped page was changed by a user
- **WHEN** a proven mapped page has both a wrong parent and a meaningful body or title difference
- **THEN** the system SHALL reconcile hierarchy and current source content as new verified destination revisions rather than marking a conflict

#### Scenario: Destination cannot move pages
- **WHEN** a proven mapped page has the wrong parent and the destination adapter cannot move it safely
- **THEN** the system SHALL create a source-derived replacement under the expected parent, preserve the old ID in state history, reset resource mappings, and leave the old page untouched

#### Scenario: Hierarchy repair fails
- **WHEN** move, recreation, or parent verification fails because of API, permission, network, missing parent, or irreducible identity ambiguity
- **THEN** the affected page SHALL fail or conflict as applicable and selected descendants SHALL remain causally blocked rather than being created under the wrong parent


# resumable-source-inventory Specification

## Purpose
Make read-only source discovery and inventory durable and selectively recoverable so large transfers do not repeat successful work after isolated transient provider failures.

## Requirements

### Requirement: Durable per-page source inventory
The system SHALL atomically checkpoint each successfully inspected source page, its required page details, resource metadata, normalized document, and enabled comment inventory inside the ignored workdir cache before destination mutation.

#### Scenario: One page completes inventory
- **WHEN** page details, resources, normalization, and enabled comments have been inspected successfully
- **THEN** a process interruption or later page failure SHALL NOT discard that page's reusable source checkpoint

#### Scenario: Sensitive runtime content is checkpointed
- **WHEN** source bodies or comments are written to an inventory checkpoint
- **THEN** they SHALL remain under the ignored selected workdir, use owner-only files, and SHALL NOT appear in state, reports, logs, Git, or the npm package

### Requirement: Compatible inventory snapshot continuation
The system SHALL resume an unfinished source inventory only when canonical migration identity and inventory-affecting options match, while reconciling the current enumerated source set by immutable page identity.

#### Scenario: Failed preflight is repeated
- **WHEN** the same migration repeats after an incomplete preflight with unchanged scope, source status, and comment policy
- **THEN** compatible completed page checkpoints SHALL be reused and only missing, stale, or failed pages SHALL require full reinventory

#### Scenario: Source enumeration gains or loses pages
- **WHEN** the current hierarchy enumeration differs from the unfinished snapshot
- **THEN** new immutable IDs SHALL be inventoried, absent IDs SHALL not be selected, retained IDs SHALL keep compatible checkpoints, and the reconciliation SHALL be reported

#### Scenario: Source locator changes for a retained ID
- **WHEN** an enumerated immutable page ID has a locator different from its checkpoint
- **THEN** that page SHALL be refreshed while retaining immutable identity and SHALL NOT be duplicated

#### Scenario: Inventory options differ
- **WHEN** canonical migration identity, scope, source status, or comment policy differs from the snapshot
- **THEN** the system SHALL start a separate current snapshot and SHALL NOT apply incompatible cached outcomes

#### Scenario: Fresh run is requested
- **WHEN** the operator supplies `--fresh`
- **THEN** the system SHALL ignore the resumable inventory snapshot and collect a new source inventory without deleting source or destination data

### Requirement: Selective transient inventory recovery
The system SHALL perform bounded page-level recovery rounds for retryable discovery and inventory failures after ordinary request retries, without repeating successful page operations.

#### Scenario: Isolated retryable failure recovers
- **WHEN** one or more page-detail, attachment-list, grid-list, grid-read, or comment-read operations exhaust ordinary retries with `429`, `5xx`, or a retryable network error
- **THEN** only affected operations SHALL be retried in bounded recovery rounds with cooldown and reduced concurrency

#### Scenario: Retry-After is available
- **WHEN** a retryable provider response supplies `Retry-After`
- **THEN** recovery SHALL wait at least that cooldown before scheduling the affected provider operation

#### Scenario: Recovery remains exhausted
- **WHEN** a required page or resource inventory operation still fails after all recovery rounds
- **THEN** the run SHALL retain all successful checkpoints, report the exact remaining failures, and stop before every destination mutation

### Requirement: Source snapshot lifecycle
The system SHALL retain a source inventory snapshot while a dry-run or failed/interrupted live transfer may be continued and SHALL retire it only after a terminal successful live transfer or explicit fresh collection.

#### Scenario: Dry-run completes
- **WHEN** a dry-run produces a complete compatible inventory
- **THEN** a subsequent live run MAY reuse that snapshot after reconciling current immutable source enumeration

#### Scenario: Live transfer fails after preflight
- **WHEN** destination work fails or is interrupted after source inventory completes
- **THEN** the next compatible run SHALL reuse the source snapshot while ordinary destination state controls mutation resume

#### Scenario: Live transfer completes
- **WHEN** the live transfer reaches `completed` or `completed-with-warnings`
- **THEN** the snapshot SHALL no longer be eligible for a later source-authoritative run and that later run SHALL collect current source data

### Requirement: Operation-specific inventory diagnostics
Every source inventory failure SHALL identify its stable operation, affected page, retryability, safe provider status, attempt count, and recovery outcome without exposing credentials or response bodies.

#### Scenario: Resource preflight fails
- **WHEN** attachments, grid summaries, or one grid payload cannot be read
- **THEN** terminal and report diagnostics SHALL distinguish `attachments-list`, `grids-list`, or `grid-read` instead of emitting only a generic resource-preflight message

#### Scenario: Inventory is incomplete
- **WHEN** the preflight barrier prevents destination mutation
- **THEN** terminal output SHALL show inspected and total pages, reused checkpoints, remaining failures, destination mutation count zero, and the exact repeat command or action

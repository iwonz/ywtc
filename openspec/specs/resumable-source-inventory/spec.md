# resumable-source-inventory Specification

## Purpose
Make read-only source discovery and inventory durable and selectively recoverable so large transfers do not repeat successful work after isolated transient provider failures.

## Requirements

### Requirement: Durable per-page source inventory
The system SHALL atomically checkpoint required page details and normalized content separately from each independently fetched resource enrichment and enabled comment inventory inside the ignored workdir cache before destination mutation.

#### Scenario: One page completes inventory
- **WHEN** required page details, resource enumeration, normalization, and enabled comments have been inspected successfully
- **THEN** a process interruption or later page failure SHALL NOT discard that page's reusable source checkpoint

#### Scenario: One resource enrichment completes
- **WHEN** an independently identified Grid or another resource payload is read successfully
- **THEN** its immutable source identity, payload fingerprint, normalized representation, and verified outcome SHALL be checkpointed without waiting for other enrichments on the page

#### Scenario: One resource enrichment remains unavailable
- **WHEN** required page details and resource enumeration are complete but one independently identified resource payload exhausts retryable reads
- **THEN** the page checkpoint SHALL retain its complete core content, the failed resource outcome, and enough source identity for a readable fallback and targeted retry

#### Scenario: Sensitive runtime content is checkpointed
- **WHEN** source bodies, resource payloads, or comments are written to an inventory checkpoint
- **THEN** checkpoint files SHALL remain under the ignored selected workdir with owner-only permissions and SHALL NOT enter Git or the npm package; state, logs, and downloadable report JSON SHALL exclude complete page and comment bodies while local HTML MAY contain explicitly scoped sandboxed previews

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

### Requirement: Selective structural and enrichment recovery
The system SHALL perform bounded operation-level recovery for retryable discovery and inventory failures after ordinary request retries, without repeating successful page or resource operations.

#### Scenario: Isolated retryable failure recovers
- **WHEN** one or more page-detail, attachment-list, grid-list, grid-read, or comment-read operations exhaust ordinary retries with `429`, `5xx`, or a retryable network error
- **THEN** only affected operations SHALL be retried in bounded recovery rounds with cooldown and reduced concurrency

#### Scenario: Retry-After is available
- **WHEN** a retryable provider response supplies `Retry-After`
- **THEN** recovery SHALL wait at least that cooldown before scheduling the affected provider operation

#### Scenario: Required structural recovery remains exhausted
- **WHEN** selected hierarchy, immutable page identity, ordinary page content, or resource enumeration remains unresolved after all recovery rounds
- **THEN** the run SHALL retain successful checkpoints, report exact remaining failures, and stop before every destination mutation

#### Scenario: Identified Grid payload recovery remains exhausted
- **WHEN** a Grid was enumerated by immutable ID but its payload remains unavailable after all recovery rounds
- **THEN** the run SHALL continue with the page's complete core content, a readable source fallback, a retryable resource outcome, and no loss of successful unrelated inventory

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

### Requirement: Operation-specific inventory failure diagnostics
Every source inventory failure SHALL identify its stable operation, affected page or resource, retryability, safe provider status, attempt count, recovery outcome, and impact on the mutation barrier without exposing credentials or response bodies.

#### Scenario: Resource preflight fails
- **WHEN** attachments, Grid summaries, or one Grid payload cannot be read
- **THEN** terminal and report diagnostics SHALL distinguish `attachments-list`, `grids-list`, or `grid-read` instead of emitting only a generic resource-preflight message

#### Scenario: Structural inventory is incomplete
- **WHEN** the preflight barrier prevents destination mutation
- **THEN** terminal output SHALL show inspected and total pages, reused checkpoints, remaining structural failures, destination mutation count zero, and the exact retry command

#### Scenario: Resource enrichment is incomplete
- **WHEN** a non-blocking Grid payload remains unavailable
- **THEN** terminal and report output SHALL show topology, page-body, Grid-summary, and Grid-payload outcomes separately and SHALL associate the retryable issue with the Grid resource rather than failing the entire source inventory

### Requirement: Targeted retry inventory continuation
A run-correlated retry SHALL reuse compatible verified inventory for carried-forward objects and SHALL refresh current source details only for actionable pages, required dependencies, or incomplete discovery.

#### Scenario: Selected page checkpoint is unchanged
- **WHEN** the source identity and content fingerprint of an actionable page still match a complete checkpoint
- **THEN** ywtc SHALL refresh the current resource and comment inventory while reusing verified binary cache entries whose provider metadata is unchanged

#### Scenario: Selected page changed
- **WHEN** an actionable page has a different current source revision or fingerprint
- **THEN** ywtc SHALL refresh that page's details, resources, normalized content, and required comment inventory before destination mutation

#### Scenario: Unselected successful page changed
- **WHEN** a carried-forward complete page changed after the baseline run and is not required as a recovery dependency
- **THEN** retry SHALL not refresh or transfer its content

#### Scenario: Baseline discovery is incomplete
- **WHEN** retry begins from a run whose source graph was not completely discovered
- **THEN** ywtc SHALL resume and reconcile discovery through the ordinary durable checkpoint barrier before any destination mutation

#### Scenario: Targeted inventory fails
- **WHEN** a required retry inventory operation remains incomplete after bounded recovery
- **THEN** all completed checkpoints SHALL remain reusable, destination mutations SHALL remain zero, and the report SHALL identify the exact remaining object and operation

# Spec Delta

## MODIFIED Requirements

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

## REMOVED Requirements

### Requirement: Selective transient inventory recovery
**Reason**: Replaced by a consolidated current contract with redundant or superseded scenarios removed and unique behavior retained.
**Migration**: The active specification reference is now "Selective structural and enrichment recovery"; this documentation change requires no runtime conversion or operator action.

### Requirement: Operation-specific inventory diagnostics
**Reason**: Replaced by a consolidated current contract with redundant or superseded scenarios removed and unique behavior retained.
**Migration**: The active specification reference is now "Operation-specific inventory failure diagnostics"; this documentation change requires no runtime conversion or operator action.

## ADDED Requirements

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

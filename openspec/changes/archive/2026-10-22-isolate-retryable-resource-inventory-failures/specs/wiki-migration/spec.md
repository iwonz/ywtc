# Spec Delta

## ADDED Requirements

### Requirement: Isolated source enrichment failures
The migration SHALL continue independently transferable branches when an enumerated resource enrichment is unavailable, while preserving a readable source fallback and a truthful retryable outcome for only the affected resource and page.

#### Scenario: Embedded Grid payload returns exhausted server errors
- **WHEN** page identity, hierarchy, ordinary body, and Grid summary are available but the Grid payload returns exhausted `429`, `5xx`, timeout, or retryable network errors
- **THEN** unrelated pages SHALL continue, the owning page SHALL contain its full ordinary content plus a Grid source fallback, and the page SHALL remain partial with a retryable Grid-resource issue

#### Scenario: Grid payload later becomes available
- **WHEN** a subsequent migration or targeted retry reads the previously unavailable Grid payload
- **THEN** the fallback SHALL be replaced by the supported static-table adaptation, the owning page SHALL be reverified, and the resolved Grid issue SHALL disappear

#### Scenario: Fallback cannot preserve resource identity
- **WHEN** the provider does not expose a stable resource identity or safe source location for the unavailable enrichment
- **THEN** the operation SHALL remain a required inventory failure and SHALL NOT be silently converted into a complete or partial page

## MODIFIED Requirements

### Requirement: Resumable preflight barrier for large sources
Migration SHALL require complete selected topology, immutable page identity, ordinary page content, and resource enumeration before mutation, while checkpointing independent enrichment outcomes so recoverable resource payload failures do not block unrelated branches.

#### Scenario: Late transient structural source failure
- **WHEN** required hierarchy, page identity, ordinary page content, or resource enumeration fails after other selected pages have completed inventory
- **THEN** destination mutation SHALL remain zero, completed source checkpoints SHALL remain reusable, and the retryable page SHALL be identified independently

#### Scenario: Late transient source failure
- **WHEN** one required source operation fails after other selected pages have completed inventory
- **THEN** destination mutation SHALL remain zero, completed source checkpoints SHALL remain reusable, and the retryable page SHALL be identified independently

#### Scenario: Late transient enrichment failure
- **WHEN** one enumerated Grid payload fails after other selected pages and resource payloads have completed inventory
- **THEN** the Grid SHALL retain a retryable failed outcome, the owning page SHALL use a readable fallback, and safe unrelated destination mutations SHALL continue

#### Scenario: Same migration is repeated
- **WHEN** the operator repeats a compatible migration after incomplete inventory or retryable enrichment outcomes
- **THEN** ywtc SHALL reconcile current immutable IDs, reuse compatible page and resource checkpoints, and retry only missing, changed, or failed work

#### Scenario: Required inventory becomes available
- **WHEN** every selected page has valid topology, ordinary content, resource enumeration, and an explicit outcome for every independent enrichment
- **THEN** the destination pipeline SHALL begin with the same graph, content, state, and verification guarantees as a single uninterrupted run

#### Scenario: Full inventory becomes available
- **WHEN** every selected page and required resource collection has a valid current snapshot outcome
- **THEN** the ordinary destination pipeline SHALL begin with the same graph, content, resource, comment, state, and verification guarantees as a single uninterrupted run

#### Scenario: Required preflight cannot be completed
- **WHEN** structural or required-content recovery remains exhausted
- **THEN** terminal and report output SHALL state exact failed operations, inspected and remaining counts, retryability, checkpoint reuse, destination mutation count zero, and the canonical `ywtc retry <run-id>` action

#### Scenario: Preflight cannot be completed
- **WHEN** required recovery remains exhausted
- **THEN** the terminal summary and report SHALL state the exact failed operations, inspected and remaining counts, retryability, checkpoint reuse, and a safe continuation action without presenting unmeasured objects as empty

#### Scenario: Only retryable enrichments remain
- **WHEN** required preflight is complete but one or more independent enrichments remain retryable
- **THEN** terminal and report output SHALL distinguish topology, page bodies, resource enumeration, resource payload outcomes, and affected partial pages without calling the full inventory incomplete

### Requirement: Provider-null Yandex Grid content
The system SHALL accept an explicit null inline body for a valid Yandex Wiki Grid page, distinguish it from a semantically empty ordinary page, and account for the Grid payload independently without aborting subtree discovery.

#### Scenario: Grid data is available through the resource API
- **WHEN** Yandex Wiki returns a valid Grid page with `content: null` and exposes its Grid rows and columns through the Grid API
- **THEN** the page SHALL continue through discovery and transfer, the complete Grid SHALL be rendered as the supported static-table adaptation, and null inline content SHALL NOT make the page partial or failed

#### Scenario: Grid data is temporarily unavailable through the provider API
- **WHEN** Yandex Wiki returns a valid Grid page with `content: null`, exposes stable Grid identity, but the Grid payload read exhausts retryable provider errors
- **THEN** the destination SHALL receive a readable explanation and absolute source link, only that page SHALL be partial with a retryable Grid-resource issue, and the remaining selected tree SHALL continue

#### Scenario: Grid data is permanently unavailable through the provider API
- **WHEN** Yandex Wiki returns a valid Grid page with `content: null` but exposes no recoverable Grid payload or retryable evidence
- **THEN** the destination SHALL receive a readable explanation and absolute link to the source page, only that page SHALL be partial with a provider-content degradation, and the remaining selected tree SHALL continue

#### Scenario: Grid data is unavailable through the provider API
- **WHEN** Yandex Wiki returns a valid Grid page with `content: null` but exposes no recoverable Grid payload
- **THEN** the destination SHALL receive a readable explanation and absolute link to the source page, only that page SHALL be partial with a provider-content degradation, and the remaining selected tree SHALL continue

#### Scenario: Ordinary page has no inline content field
- **WHEN** a non-Grid page response omits or invalidates content required to represent that page
- **THEN** the response SHALL remain an invalid provider contract and SHALL NOT be silently classified as an empty page

#### Scenario: Ordinary page is semantically empty
- **WHEN** a valid ordinary page has an explicit string body that contains no meaningful content
- **THEN** existing semantic-empty handling SHALL apply and the page MAY remain complete without a fallback

# Spec Delta

## ADDED Requirements

### Requirement: Current-outcome retry selection
Retry planning SHALL select actionable page, resource, comment, Grid, discovery, and verification work from the latest unresolved object outcomes and SHALL ignore historical diagnostics already resolved in the same lineage.

#### Scenario: Earlier consistency error recovered
- **WHEN** a prior attempt emitted a retryable diagnostic but the latest aggregate report verifies the affected object as complete
- **THEN** retry SHALL classify the object as resolved and SHALL not mutate it again because of that historical diagnostic

#### Scenario: Upload is proven but verification remains open
- **WHEN** a resource has confirmed upload evidence and unresolved retryable read-back verification
- **THEN** retry SHALL perform the minimum verification or reconciliation work without uploading a duplicate resource

#### Scenario: Grid outcome is unresolved
- **WHEN** the latest report contains an explicit retryable unavailable or failed Grid outcome
- **THEN** retry SHALL select that Grid enrichment and its owning page while leaving unrelated complete pages unchanged

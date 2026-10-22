# Spec Delta

## MODIFIED Requirements

### Requirement: Typed actionable retry selection
The system SHALL classify prior outcomes as `retry`, `context`, `terminal`, or `resolved` from typed page, resource, comment, discovery, and inventory evidence rather than diagnostic text.

#### Scenario: Retryable incomplete object
- **WHEN** a page, resource, comment archive, discovery operation, or inventory operation is failed or partial with unresolved retryable evidence
- **THEN** the object SHALL be selected for retry

#### Scenario: Retryable Grid payload
- **WHEN** a page is readable with a source fallback but one enumerated Grid payload has an unresolved retryable `grid-read` outcome
- **THEN** the Grid SHALL be selected as the root actionable resource and its owning page SHALL be selected only for the required final rerender and verification

#### Scenario: Interrupted object
- **WHEN** a live run left an otherwise selected object `not-started`
- **THEN** the object SHALL be selected for retry

#### Scenario: Causal blocked subtree
- **WHEN** an actionable page caused selected descendants, resources, or comment archives to be blocked
- **THEN** those dependent objects SHALL be selected in safe top-down order without being counted as independent root failures

#### Scenario: Complete or information-preserving result
- **WHEN** an object is complete without unresolved retryable mention work or has only normalization, adaptation, or preserved-external-reference evidence
- **THEN** it SHALL be resolved and SHALL NOT be retried

#### Scenario: Terminal problem
- **WHEN** an incomplete object has only non-retryable degradation, permanent typed failure, or proven ownership conflict evidence
- **THEN** it SHALL remain terminal, SHALL NOT be mutated automatically, and SHALL remain visible in the aggregate report

## REMOVED Requirements

### Requirement: Object-granular idempotent execution
**Reason**: Replaced by a consolidated current contract with redundant or superseded scenarios removed and unique behavior retained.
**Migration**: The active specification reference is now "Object-granular retry execution"; this documentation change requires no runtime conversion or operator action.

## ADDED Requirements

### Requirement: Object-granular retry execution
Retry SHALL reuse the ordinary source-authoritative page, resource, comment, verification, and checkpoint behavior while mutating only actionable objects and promoted dependencies.

#### Scenario: One resource failed
- **WHEN** a page body and other resources are complete but one managed resource is actionable
- **THEN** ywtc SHALL retry that resource, reuse verified mappings for the others, rerender and verify the owning page, and SHALL NOT duplicate complete resources

#### Scenario: One Grid payload failed
- **WHEN** a Grid payload is actionable while the page core and sibling resources have reusable checkpoints
- **THEN** ywtc SHALL reread only that Grid payload, reuse the sibling outcomes, replace its source fallback after success, and verify the owning page without rewriting unrelated pages

#### Scenario: Only comments failed
- **WHEN** an enabled comment archive is actionable while its page and ordinary resources are complete
- **THEN** ywtc SHALL retry the comment pipeline without rewriting an equivalent page body

#### Scenario: Required retry inventory is incomplete
- **WHEN** selected hierarchy, required page content, resource enumeration, or a required dependency cannot be completely inspected
- **THEN** the retry SHALL stop before every destination mutation and retain reusable successful checkpoints

#### Scenario: Retryable enrichment remains unavailable
- **WHEN** an independently identified Grid payload remains unavailable but a complete page fallback can be rendered
- **THEN** the retry SHALL preserve that resource as actionable, continue safe unrelated mutations, and leave the owning page partial until a later retry succeeds

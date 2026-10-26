## REMOVED Requirements

### Requirement: Targeted mention-resolution retry
**Reason**: Destination lookup is no longer an active operation.
**Migration**: Historical lookup diagnostics remain readable but do not select complete pages.

## ADDED Requirements

### Requirement: Decision-based mention retry boundary
Retry SHALL target actual unresolved content verification failures and SHALL NOT repeat complete pages solely because historical destination-user lookup warnings remain.

#### Scenario: Earlier lookup failed
- **WHEN** a complete page carries a recorded mention-user-unresolved diagnostic
- **THEN** it SHALL remain resolved for automatic retry regardless of the historical lookup retryability

#### Scenario: Mapping changes for successful pages
- **WHEN** an operator changes decisions for complete pages
- **THEN** ordinary migrate SHALL reconcile those changes while targeted retry SHALL retain its existing frozen selection boundary

#### Scenario: Mention representation was lost
- **WHEN** current content verification proves a missing or altered mention representation
- **THEN** the ordinary typed verification failure SHALL remain actionable without performing a user lookup

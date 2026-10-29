## ADDED Requirements

### Requirement: Shared synchronization jobs
CLI and local UI synchronization analysis/application SHALL use the same durable workspace queue, typed events, identity bindings, cancellation and checkpoint behavior as other operations. A Plan ID SHALL remain distinct from Job ID and live Run ID.

#### Scenario: Analysis completes
- **WHEN** a synchronization analysis job saves a complete review plan
- **THEN** the job SHALL report its Plan ID and review location without claiming destination objects were written

#### Scenario: Application is resumed
- **WHEN** an interrupted synchronization is explicitly continued
- **THEN** owned checkpoints SHALL be reconciled, successful writes SHALL not repeat, and unrelated baseline drift SHALL invalidate the confirmation

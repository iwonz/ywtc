# Spec Delta

## ADDED Requirements

### Requirement: Resumable preflight barrier for large sources
The migration preflight SHALL require a complete selected source inventory before destination mutation while durably reusing compatible successful source checkpoints across retries and interrupted runs.

#### Scenario: Late transient source failure
- **WHEN** one required source operation fails after other selected pages have completed inventory
- **THEN** destination mutation SHALL remain zero, completed source checkpoints SHALL remain reusable, and the retryable page SHALL be identified independently

#### Scenario: Same migration is repeated
- **WHEN** the operator repeats a compatible migration after incomplete inventory
- **THEN** ywtc SHALL reconcile the current selected immutable IDs, reuse valid completed checkpoints, and retry only missing, changed, or failed inventory work

#### Scenario: Full inventory becomes available
- **WHEN** every selected page and required resource collection has a valid current snapshot outcome
- **THEN** the ordinary destination pipeline SHALL begin with the same graph, content, resource, comment, state, and verification guarantees as a single uninterrupted run

#### Scenario: Preflight cannot be completed
- **WHEN** required recovery remains exhausted
- **THEN** the terminal summary and report SHALL state the exact failed operations, inspected and remaining counts, retryability, checkpoint reuse, and a safe continuation action without presenting unmeasured objects as empty

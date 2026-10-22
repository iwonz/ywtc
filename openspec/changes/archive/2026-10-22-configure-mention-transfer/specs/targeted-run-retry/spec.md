# targeted-run-retry Delta

## ADDED Requirements

### Requirement: Targeted mention-resolution retry
Retry planning SHALL select unresolved mention work caused by a typed transient destination lookup failure even when the owning page remains complete because a fallback was verified.

#### Scenario: Transient lookup failure is actionable
- **WHEN** the latest aggregate outcome contains a retryable mention warning caused by timeout, rate limiting, network failure, or provider 5xx
- **THEN** retry SHALL select the owning page's mention resolution and final render while carrying forward its verified resources and unrelated content outcomes

#### Scenario: Deterministic unresolved identity is terminal
- **WHEN** the latest outcome is not found, unsupported lookup, missing template data, or ambiguous identity without a transient provider failure
- **THEN** retry SHALL keep the verified fallback and SHALL NOT select that mention automatically

#### Scenario: Retry resolves the user
- **WHEN** an actionable lookup later returns one verified destination user
- **THEN** retry SHALL replace the fallback with the native mention, remove the resolved warning, and verify the updated page without duplicating destination objects

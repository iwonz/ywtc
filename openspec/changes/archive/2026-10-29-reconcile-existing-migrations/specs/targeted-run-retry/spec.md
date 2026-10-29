## ADDED Requirements

### Requirement: Intentional exclusion continuity
Automatic and manually selected retries SHALL preserve confirmed operator-trash exclusions, retain their immutable mappings and refuse implicit recreation or terminal override. Discovery expansion for a previously complete inventory SHALL remain an explicit synchronization operation.

#### Scenario: Excluded mapping is selected
- **WHEN** automatic retry, terminal override or dependency recovery encounters an intentional trash exclusion
- **THEN** the excluded page SHALL remain excluded and dependencies SHALL explain the need for explicit operator resolution instead of recreating it

#### Scenario: Source permissions expand
- **WHEN** a completed baseline has newly accessible descendants
- **THEN** ordinary retry SHALL preserve its existing graph and guidance SHALL direct the operator to synchronization for expansion

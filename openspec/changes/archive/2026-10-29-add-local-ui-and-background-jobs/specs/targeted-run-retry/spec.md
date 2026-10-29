## ADDED Requirements

### Requirement: Preview-bound operator selection
Operators SHALL select pages, resources, Grid snapshots or comment archives through a preview-bound plan. Manual terminal retries SHALL require confirmation and SHALL NOT override immutable identity ambiguity or required dependency verification.

#### Scenario: Operator retries a permanent diagnostic
- **WHEN** an operator confirms one manual attempt after correcting external permissions
- **THEN** only the selected objects and disclosed dependencies SHALL run, without changing automatic retry classification for future attempts

#### Scenario: Preview evidence changed
- **WHEN** baseline, selection, policies, source or destination evidence changes before a selective write
- **THEN** the operation SHALL require a new preview without treating drift as ownership conflict

### Requirement: Identity-preserving decisions application
Applying a published decision revision SHALL refresh affected current source representations and update selected existing destination IDs only, with read-back verification and aggregate reporting. It SHALL NOT create pages, reparent them or silently modify unselected decisions.

#### Scenario: Successful page has changed decisions
- **WHEN** an effective decision changes, including deletion to skip
- **THEN** its affected page or archive SHALL be previewed and eligible for explicit application while unrelated objects remain carried forward

#### Scenario: Destination mapping is unavailable
- **WHEN** a selected mapping is absent or inaccessible
- **THEN** decisions application SHALL require recovery rather than create a replacement page or claim the prepared representation was transferred

## ADDED Requirements

### Requirement: Space-root inventory identity
Space inventory SHALL bind checkpoints to immutable space identity, retain only real-page source checkpoints, and reconcile exhaustive page enumeration before the destination mutation barrier.

#### Scenario: Homepage changes during continuation
- **WHEN** a compatible unfinished space inventory is resumed after its homepage or name changes
- **THEN** unchanged real-page checkpoints SHALL remain reusable and the generated destination section SHALL not cause a page-detail, resource or comment source API call

#### Scenario: Space pagination is invalid
- **WHEN** space enumeration repeats a cursor, makes no progress or returns inconsistent immutable identity
- **THEN** inventory SHALL remain incomplete and destination mutations SHALL remain zero

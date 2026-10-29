## ADDED Requirements

### Requirement: Shared analysis and revision-safe editing
The local application SHALL collect selected mentions and hashtags in one source-only traversal, preserve existing JSON contracts and maintain drafts and immutable published revisions with compare-and-swap editing.

#### Scenario: Source is rescanned
- **WHEN** an existing catalog is rescanned
- **THEN** matching identities SHALL retain decisions, new identities SHALL default to skip, absent identities SHALL not be silently deleted and incomplete inventory SHALL remain visible

#### Scenario: Another tab saves first
- **WHEN** an editor submits a stale revision or invalid import
- **THEN** the current valid document SHALL remain unchanged and the operator SHALL receive an actionable error

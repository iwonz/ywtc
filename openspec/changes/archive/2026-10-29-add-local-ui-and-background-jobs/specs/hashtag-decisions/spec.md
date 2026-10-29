## ADDED Requirements

### Requirement: Revisioned hashtag control-center editing
The local application SHALL share source traversal and editing infrastructure without changing hashtag JSON or exact case-sensitive identity. Drafts SHALL not activate policies, and published documents SHALL be immutable.

#### Scenario: Combined analysis includes hashtags
- **WHEN** an operator collects both mention and hashtag catalogs
- **THEN** bodies/comments SHALL be read once, without resource payloads or destination access, and each catalog SHALL preserve its own decision semantics and source binding

#### Scenario: Existing tag decisions are rescanned
- **WHEN** matching, new or absent tags are observed
- **THEN** matching decisions SHALL survive, new tags SHALL default to skip, absent entries SHALL remain until explicit removal and unavailable data SHALL not be reported as complete

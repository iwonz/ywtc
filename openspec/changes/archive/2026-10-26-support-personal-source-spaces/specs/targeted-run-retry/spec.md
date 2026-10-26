## ADDED Requirements

### Requirement: Space-root retry continuity
Retry SHALL restore the immutable space-root identity and separate section mapping, preserve its frozen real-page selection, and treat the section as dependency context rather than a real source page.

#### Scenario: Space homepage changes
- **WHEN** retry restores a space-root run after its homepage changes
- **THEN** it SHALL retain the original state identity, retry only actionable real objects and reuse the same section without discovering unrelated new branches

#### Scenario: Section is unavailable
- **WHEN** an actionable page depends on an unavailable mapped section
- **THEN** ordinary bounded dependency recovery SHALL verify or recover the section before page writes, or report one root cause and causal blocks without deleting provider data

## ADDED Requirements

### Requirement: Rewrite source inventory refresh
A rewrite SHALL collect current selected page, resource, normalization, and enabled comment inventory without reusing completed source inventory snapshots while preserving destination mappings and verified binary cache.

#### Scenario: Prior source snapshot is complete
- **WHEN** rewrite starts with a compatible completed source snapshot
- **THEN** it SHALL create a fresh inventory generation, reread selected source data, and leave prior destination state intact

#### Scenario: Targeted rewrite has read-only context
- **WHEN** a targeted retry requests rewrite
- **THEN** selected payloads SHALL be rebuilt while successful dependency context SHALL remain read-only unless in-place hierarchy repair is necessary

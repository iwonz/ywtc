## ADDED Requirements

### Requirement: Independent hashtag workspace policy
The workspace SHALL accept hashtags off/mapping independently from mentions, initialize hashtags off, and validate a selected source-bound mapping before migrate or doctor contacts providers. Source-only decision exports SHALL NOT require either configured mapping file.

#### Scenario: Missing hashtag mapping is prepared
- **WHEN** hashtags export uses valid source credentials while a configured mapping file is absent
- **THEN** it SHALL export source decisions without loading that file, writing workspace configuration or creating migration state

#### Scenario: Hashtag policy is invalid
- **WHEN** migrate or doctor cannot load the configured hashtag document for its selected source
- **THEN** it SHALL identify the policy error before provider calls without changing mentions behavior

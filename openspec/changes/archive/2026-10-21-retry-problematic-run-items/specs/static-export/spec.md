# Spec Delta

## ADDED Requirements

### Requirement: Targeted managed export retry
A filesystem retry SHALL preserve the transactional export boundary while reusing verified files from a matching managed export and regenerating actionable page payloads plus affected global artifacts.

#### Scenario: Complete managed export exists
- **WHEN** retry targets Markdown or HTML and the destination has a matching current ywtc manifest
- **THEN** ywtc SHALL construct adjacent staging from that managed baseline, replace selected pages and resources, regenerate affected navigation and manifest data, verify the complete tree, and atomically promote it

#### Scenario: Managed baseline is unavailable
- **WHEN** no complete matching export can safely supply carried-forward files
- **THEN** ywtc SHALL announce a full export rebuild, reuse compatible source cache where possible, and SHALL publish only a completely verified staging tree

#### Scenario: Destination is unmanaged
- **WHEN** retry finds a non-empty filesystem destination without a matching current ywtc manifest
- **THEN** it SHALL refuse replacement before modifying that destination

#### Scenario: Archive policy is enabled
- **WHEN** a targeted export retry changes the managed output and its restored request enables archive creation
- **THEN** ywtc SHALL stream a new non-overwriting ZIP from the final verified tree and SHALL leave earlier archives untouched

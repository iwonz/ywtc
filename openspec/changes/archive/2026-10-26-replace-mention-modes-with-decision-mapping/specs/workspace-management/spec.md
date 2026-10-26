## ADDED Requirements

### Requirement: Strict mapping policy configuration
The workspace SHALL accept only optional mention modes `off` and `mapping`, default to off, and require a mappingFile path in mapping mode. Unknown policy fields and removed modes SHALL fail strict configuration validation.

#### Scenario: Workspace is initialized
- **WHEN** init creates configuration
- **THEN** YAML SHALL include mentions.mode off without personal data or a mandatory mapping path

#### Scenario: Mapping is loaded
- **WHEN** migrate or doctor uses mapping mode
- **THEN** its file SHALL be read and validated once before provider calls, with relative paths based on the configuration directory and absolute/tilde paths supported

#### Scenario: Mapping is unusable
- **WHEN** the file is absent, malformed, invalid, or bound to another selected source
- **THEN** the command SHALL identify the file and invalid field safely before API requests without converting or modifying it

#### Scenario: Export prepares a missing mapping
- **WHEN** mentions export uses valid source credentials
- **THEN** it SHALL not require the configured mapping file to exist and SHALL not modify workspace configuration or migration state

## REMOVED Requirements

### Requirement: Strict global mention policy
**Reason**: The mapping-only contract removes placeholder and alias configuration.
**Migration**: No automatic conversion is provided.

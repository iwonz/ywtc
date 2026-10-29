## ADDED Requirements

### Requirement: Recoverable configuration interface
Invalid workspace configuration SHALL remain repairable in the local interface. The application SHALL distinguish schema diagnostics from unreadable YAML, preserve credential masking, and keep repair drafts separate from the active configuration until explicit validated application.

#### Scenario: Operator fixes several incomplete profiles
- **WHEN** initial settings contain multiple invalid fields
- **THEN** the operator SHALL be able to stage profile edits, remove unwanted draft profiles, adjust supported policies/defaults/limits, and apply the complete repair without a CLI handoff

#### Scenario: Configuration remains invalid
- **WHEN** a repair draft still violates the current schema
- **THEN** precise field diagnostics SHALL remain actionable and no configuration replacement or provider operation SHALL occur

#### Scenario: Migration form opens before repair
- **WHEN** the active configuration is schema-invalid
- **THEN** migration submission SHALL remain disabled with guidance to complete settings first

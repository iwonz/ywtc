## ADDED Requirements

### Requirement: Browser workspace setup
The local application SHALL register or initialize explicitly selected workspaces, edit validated profiles/defaults and perform read-only connection probes without returning existing credentials. Concurrent writes SHALL use revision checks and preserve unrelated YAML changes.

#### Scenario: Profile is changed in another client
- **WHEN** browser and another writer change overlapping configuration fields
- **THEN** the application SHALL report the conflicting revision or fields without replacing the newer values

### Requirement: Explicit published policy activation
Decision drafts SHALL remain separate from active workspace policies. Only explicit activation of a validated immutable source-bound document SHALL update the corresponding mappingFile, leaving the other policy unchanged.

#### Scenario: Draft is saved
- **WHEN** an operator saves an edited decision draft
- **THEN** active CLI policies SHALL remain unchanged until activation is confirmed

#### Scenario: Queued profile identity changed
- **WHEN** execution detects a different provider or canonical instance from its accepted request
- **THEN** it SHALL require new confirmation before provider calls while current credentials remain confined to worker memory

## MODIFIED Requirements

### Requirement: Browser workspace setup
The local application SHALL register or initialize explicitly selected workspaces, edit validated profiles/defaults and perform read-only connection probes without returning existing credentials. Concurrent writes SHALL use revision checks and preserve unrelated YAML changes.

#### Scenario: Profile is changed in another client
- **WHEN** browser and another writer change overlapping configuration fields
- **THEN** the application SHALL report the conflicting revision or fields without replacing the newer values

#### Scenario: Existing configuration is incomplete or schema-invalid
- **WHEN** browser setup opens a readable configuration that fails strict validation
- **THEN** it SHALL show supported editable fields and precise diagnostics without returning tokens, emails, unknown raw sections or the original YAML
- **AND** unchanged credentials SHALL remain available server-side while the operator stages repairs across profiles and policies

#### Scenario: Repair is applied
- **WHEN** the operator explicitly confirms repair and the entire candidate passes current strict validation against the original revision
- **THEN** the application SHALL atomically apply it after privately backing up the exact original YAML, without changing migration state or calling providers
- **AND** invalid or stale candidates SHALL leave the original untouched

#### Scenario: YAML cannot be parsed safely
- **WHEN** browser setup encounters malformed YAML or a non-object document
- **THEN** it SHALL offer explicit replacement using a new draft and private backup, without exposing raw source or guessing credentials

# Spec Delta

## MODIFIED Requirements

### Requirement: Workdir-scoped configuration
The CLI SHALL load named connections, direct credentials, defaults, and network limits exclusively from `<workdir>/ywtc.config.yaml`, validate the entire document structure as one strict current format, and require runtime credentials only for profiles selected by the operation before API requests.

#### Scenario: Profile selection by URL
- **WHEN** a full source or destination URL uniquely matches configured base URLs
- **THEN** the longest matching compatible profile SHALL be selected without requiring a profile flag

#### Scenario: Ambiguous shorthand
- **WHEN** an ID or slug can resolve through multiple compatible profiles
- **THEN** validation SHALL require the corresponding explicit profile and list valid names

#### Scenario: Missing secret
- **WHEN** a selected profile has an empty required `token` or Cloud `email`
- **THEN** the command SHALL identify the exact configuration field and file without revealing any credential and SHALL stop before API requests

#### Scenario: Process override
- **WHEN** process environment contains names previously associated with connection secrets or runtime overrides
- **THEN** configuration values SHALL continue to come exclusively from `ywtc.config.yaml`

#### Scenario: Missing settings
- **WHEN** required profile settings are empty, unknown, invalid, or form an unsupported provider deployment/authentication pair
- **THEN** the command SHALL exit non-zero before API requests and list the affected field paths and configuration file without exposing secrets or applying compatibility behavior

#### Scenario: Relative state path
- **WHEN** migration receives `--state relative/file.json`
- **THEN** it SHALL resolve the path under the selected workdir and reject traversal outside it

## REMOVED Requirements

### Requirement: Deterministic workdir selection
**Reason**: Replaced by a consolidated current contract with redundant or superseded scenarios removed and unique behavior retained.
**Migration**: The active specification reference is now "Deterministic workspace boundaries"; this documentation change requires no runtime conversion or operator action.

### Requirement: Read-only workspace and capability diagnosis
**Reason**: Replaced by a consolidated current contract with redundant or superseded scenarios removed and unique behavior retained.
**Migration**: The active specification reference is now "Read-only workspace diagnosis"; this documentation change requires no runtime conversion or operator action.

## ADDED Requirements

### Requirement: Deterministic workspace boundaries
Operational CLI commands SHALL select their workdir in the order explicit `--workdir`, the exact current directory when it contains `ywtc.config.yaml`, then `~/.ywtc`, and SHALL resolve `~` and relative paths. Configuration, state, cache, backups, and reports SHALL remain inside that workdir; explicit filesystem destinations MAY reside elsewhere. `init` SHALL use only explicit `--workdir` or `~/.ywtc`.

#### Scenario: Explicit workdir
- **WHEN** an operator supplies `--workdir <path>`
- **THEN** the CLI SHALL use the normalized absolute path regardless of a current-directory configuration

#### Scenario: Configured current directory
- **WHEN** an operational command has no explicit workdir and the current directory directly contains `ywtc.config.yaml`
- **THEN** the CLI SHALL use the current directory without searching its ancestors

#### Scenario: Default workdir
- **WHEN** an operational command has neither an explicit workdir nor a current-directory configuration
- **THEN** the CLI SHALL use the current user's `~/.ywtc` directory

#### Scenario: Default initialization workdir
- **WHEN** `init` is invoked without `--workdir`
- **THEN** it SHALL initialize `~/.ywtc` even when the current directory contains `ywtc.config.yaml`

### Requirement: Read-only workspace diagnosis
The `doctor` command SHALL validate the selected workspace and strict current configuration without creating files, and SHALL perform complete read-only source/destination capability preflight when both endpoints are supplied using the same locator, profile, scope, and format rules as migration.

#### Scenario: Missing workspace
- **WHEN** `doctor` selects a workdir without `ywtc.config.yaml`
- **THEN** it SHALL make no filesystem changes and report the exact `ywtc init` command needed to initialize that workdir

#### Scenario: Endpoint diagnosis
- **WHEN** `doctor` receives both `--source` and `--destination`
- **THEN** it SHALL resolve profiles/endpoints, verify required direction capabilities without mutation, and report provider/platform/version information plus corrective actions

#### Scenario: Configuration diagnosis
- **WHEN** `doctor` is run without `--source` and `--destination`
- **THEN** it SHALL report workdir and all profile configuration failures without contacting vendor APIs

#### Scenario: Partial endpoint arguments
- **WHEN** `doctor` receives only one endpoint
- **THEN** it SHALL reject the invocation and explain that both are required for capability preflight

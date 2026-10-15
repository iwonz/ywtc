# workspace-management Specification

## Purpose
Define deterministic workspace selection, safe local configuration, capability diagnosis, state placement, and controlled CLI self-update behavior.

## Requirements

### Requirement: Deterministic workdir selection
The CLI SHALL select its workdir in the order explicit `--workdir`, current directory containing `.ywtc-workspace.json`, then `~/.ywtc`, and SHALL resolve `~` and relative paths without writing outside the selected workdir.

#### Scenario: Explicit workdir
- **WHEN** an operator supplies `--workdir <path>`
- **THEN** the CLI SHALL use the normalized absolute path regardless of a current-directory marker

#### Scenario: Marked current directory
- **WHEN** no explicit workdir is supplied and the current directory contains `.ywtc-workspace.json`
- **THEN** the CLI SHALL use the current directory

#### Scenario: Default workdir
- **WHEN** neither an explicit workdir nor a current-directory marker exists
- **THEN** the CLI SHALL use the current user's `~/.ywtc` directory

### Requirement: Safe idempotent workspace initialization
The `init` command and migration auto-initialization SHALL create the selected directory, `.ywtc-workspace.json`, `.env`, `ywtc.config.yaml`, and `.states/` without overwriting existing content and with user-only credential-file permissions where supported.

#### Scenario: New workspace
- **WHEN** initialization targets an absent workdir
- **THEN** all workspace artifacts SHALL be created from safe empty profile and credential templates

#### Scenario: Existing workspace
- **WHEN** one or more workspace artifacts already exist
- **THEN** initialization SHALL preserve them and report which artifacts were reused or created

#### Scenario: Incomplete automatic workspace
- **WHEN** `migrate` selects an absent workdir
- **THEN** it SHALL initialize the workspace and then stop before API requests with the `.env` and `ywtc.config.yaml` paths plus missing fields if configuration is incomplete

### Requirement: Workdir-scoped configuration
The CLI SHALL load non-secret named connections from `<workdir>/ywtc.config.yaml`, resolve referenced secrets from `<workdir>/.env` with process environment precedence, and validate only the profiles required by the command before API requests.

#### Scenario: Profile selection by URL
- **WHEN** a full source or destination URL uniquely matches configured base URLs
- **THEN** the longest matching compatible profile SHALL be selected without requiring a profile flag

#### Scenario: Ambiguous shorthand
- **WHEN** an ID or slug can resolve through multiple compatible profiles
- **THEN** validation SHALL require the corresponding explicit profile and list valid names

#### Scenario: Missing secret
- **WHEN** a selected profile references an empty or absent secret environment variable
- **THEN** the command SHALL identify the variable and `.env` path without revealing other secrets and SHALL stop before API requests

#### Scenario: Process override
- **WHEN** a key exists in both the workdir `.env` and the process environment
- **THEN** the process environment value SHALL be used

#### Scenario: Missing settings
- **WHEN** required profile settings are empty, invalid, or form an unsupported provider deployment/authentication pair
- **THEN** the command SHALL exit non-zero before API requests and list the affected profile fields, configuration paths, and corrective guidance without exposing secrets

#### Scenario: Relative state path
- **WHEN** migration receives `--state relative/file.json`
- **THEN** it SHALL resolve the path under the selected workdir and reject traversal outside it

### Requirement: Read-only workspace and capability diagnosis
The `doctor` command SHALL validate workspace and profiles without endpoints and SHALL perform complete read-only source/destination capability preflight when both are supplied using the same locator, profile, scope, and format rules as migration.

#### Scenario: Endpoint diagnosis
- **WHEN** `doctor` receives both `--source` and `--destination`
- **THEN** it SHALL resolve profiles/endpoints, verify required direction capabilities without mutation, and report provider/platform/version information plus corrective actions

#### Scenario: Configuration diagnosis
- **WHEN** `doctor` is run without `--source` and `--destination`
- **THEN** it SHALL report workdir and profile configuration validity with actionable failures without contacting vendor APIs

#### Scenario: Full diagnosis
- **WHEN** `doctor` receives both `--source` and `--destination`
- **THEN** it SHALL authenticate, resolve both endpoints, verify the direction-specific read/write capabilities without mutations, and report provider/platform/version information

#### Scenario: Partial endpoint arguments
- **WHEN** `doctor` receives only one endpoint
- **THEN** it SHALL reject the invocation and explain that both are required for capability preflight

### Requirement: Safe update discovery and installation
The `update` command SHALL report the current version, latest published version, detected installation channel, and a safe update action; it SHALL modify the environment only with `--install` and only for supported global npm or Homebrew installations.

#### Scenario: Check only
- **WHEN** `update` is invoked without `--install`
- **THEN** it SHALL perform only read operations and print the appropriate update command

#### Scenario: Global npm installation
- **WHEN** `update --install --via npm` runs from a global npm installation
- **THEN** it SHALL spawn `npm install -g @iwonz/ywtc@latest` with an argument array and without a shell

#### Scenario: Homebrew installation
- **WHEN** `update --install --via brew` runs from a Homebrew installation
- **THEN** it SHALL sequentially spawn `brew update` and `brew upgrade ywtc` with argument arrays and without a shell

#### Scenario: Self-modification is unsafe
- **WHEN** execution is through npx, a local dependency, or a source checkout
- **THEN** the CLI SHALL not modify the environment and SHALL print the appropriate safe command instead

## ADDED Requirements

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
The `init` command and migration auto-initialization SHALL create the selected directory, `.ywtc-workspace.json`, `.env`, and `.states/` with user-only writable credential-file permissions where supported, without overwriting existing content.

#### Scenario: New workspace
- **WHEN** initialization targets an absent workdir
- **THEN** all required workspace artifacts SHALL be created from the safe empty configuration template

#### Scenario: Existing workspace
- **WHEN** one or more workspace artifacts already exist
- **THEN** initialization SHALL preserve them and report which artifacts were reused or created

#### Scenario: Incomplete automatic workspace
- **WHEN** `migrate` selects an absent workdir
- **THEN** it SHALL initialize the workspace and then stop before API requests with the `.env` path and missing fields if configuration is incomplete

### Requirement: Workdir-scoped configuration
The CLI SHALL load `<workdir>/.env` and overlay process environment variables with higher precedence, SHALL validate all required values before API requests, and SHALL resolve relative explicit state paths from the workdir.

#### Scenario: Process override
- **WHEN** a key exists in both the workdir `.env` and the process environment
- **THEN** the process environment value SHALL be used

#### Scenario: Missing settings
- **WHEN** required settings are empty, invalid, or form an unsupported Confluence deployment/authentication pair
- **THEN** the command SHALL exit non-zero before API requests and list the affected setting names, `.env` path, and corrective guidance without exposing secrets

#### Scenario: Relative state path
- **WHEN** migration receives `--state relative/file.json`
- **THEN** it SHALL resolve the path under the selected workdir and reject traversal outside it

### Requirement: Read-only workspace and capability diagnosis
The `doctor` command SHALL validate workspace and configuration without source/target and SHALL perform a full read-only source/target capability preflight only when both are supplied.

#### Scenario: Configuration diagnosis
- **WHEN** `doctor` is run without `--source` and `--target`
- **THEN** it SHALL report workdir, configuration validity, deployment profile, and actionable failures without contacting vendor APIs

#### Scenario: Full diagnosis
- **WHEN** `doctor` receives both `--source` and `--target`
- **THEN** it SHALL authenticate, resolve both endpoints, verify the required read/write capabilities without mutations, and report platform/version information

#### Scenario: Partial endpoint arguments
- **WHEN** `doctor` receives only one of `--source` or `--target`
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


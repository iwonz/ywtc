# workspace-management Specification

## Purpose
Define deterministic workspace selection, safe local configuration, capability diagnosis, state placement, and controlled CLI self-update behavior.

## Requirements

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

### Requirement: Safe idempotent workspace initialization
The `init` command and migration auto-initialization SHALL create the selected directory, `ywtc.config.yaml`, and `.states/` runtime directories without overwriting existing content. A newly created configuration SHALL use user-only permissions where supported; existing permissions SHALL remain untouched.

#### Scenario: New workspace
- **WHEN** initialization targets an absent workdir
- **THEN** it SHALL create a strict current configuration with empty secrets plus the state, cache, and report directories

#### Scenario: Existing workspace
- **WHEN** one or more workspace artifacts already exist
- **THEN** initialization SHALL preserve their contents and permissions and report which artifacts were reused or created

#### Scenario: Incomplete automatic workspace
- **WHEN** `migrate` selects an absent workdir
- **THEN** it SHALL initialize the workspace and then stop before API requests with the `ywtc.config.yaml` path and missing field paths if configuration is incomplete

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

### Requirement: Guided interactive initialization
The CLI SHALL provide `ywtc init --interactive` as a TTY-only wizard that requires workdir, Yandex Wiki, Confluence, review, and verification stages while retaining validated draft answers across backward and forward navigation.

#### Scenario: Default interactive workdir
- **WHEN** interactive initialization starts without `--workdir`
- **THEN** the workdir prompt SHALL default to `~/.ywtc` and SHALL allow the operator to select another valid path

#### Scenario: Explicit interactive workdir
- **WHEN** interactive initialization starts with `--workdir <path>`
- **THEN** the normalized path SHALL be the editable initial value of the workdir prompt

#### Scenario: Mandatory stages
- **WHEN** a required value is empty, invalid, or incompatible with another selected value
- **THEN** the wizard SHALL explain the field error and SHALL NOT advance past that stage

#### Scenario: Navigation
- **WHEN** the operator moves backward and then forward between completed stages
- **THEN** the wizard SHALL retain prior answers without revealing stored credentials

#### Scenario: Non-interactive terminal
- **WHEN** `init --interactive` runs without interactive input and output terminals
- **THEN** it SHALL exit with usage code `2`, make no filesystem or API changes, and recommend ordinary `ywtc init`

#### Scenario: Cancellation
- **WHEN** the operator cancels or sends SIGINT during the wizard
- **THEN** it SHALL exit with code `130` without changing workspace files or remote systems

### Requirement: Controlled existing-workspace setup
When the selected workdir already contains `ywtc.config.yaml`, the wizard SHALL offer edit, reset, or successful no-op exit while preserving runtime state and avoiding implicit destructive changes.

#### Scenario: Edit selected profiles
- **WHEN** the operator chooses edit for a valid existing configuration
- **THEN** they SHALL select one Yandex Wiki and one Confluence profile to edit or add, while unselected profiles, comments, defaults, limits, runtime state, and existing file permissions remain unchanged

#### Scenario: Reset configuration
- **WHEN** the operator chooses reset and both connection probes later succeed
- **THEN** the active configuration SHALL contain fresh `yandex` and `confluence` profiles, the previous configuration SHALL be backed up with user-only permissions under `.states/backups/`, and runtime state SHALL remain intact

#### Scenario: Exit existing workspace
- **WHEN** the operator chooses to do nothing
- **THEN** initialization SHALL exit successfully without filesystem or API changes

#### Scenario: Invalid existing configuration
- **WHEN** the existing configuration cannot be loaded as the strict current format
- **THEN** edit SHALL be unavailable with an actionable diagnostic, while reset, another workdir, and exit remain available

### Requirement: Verified atomic wizard commit
The wizard SHALL keep drafts in memory, perform read-only probes, semantically merge non-overlapping concurrent edits, and persist only a validated configuration after both providers pass verification.

#### Scenario: Yandex Wiki connection probe
- **WHEN** the wizard verifies a Yandex Wiki profile
- **THEN** it SHALL call the current-user endpoint with the configured OAuth or IAM authorization and organization header without requiring a page locator

#### Scenario: Confluence connection probe
- **WHEN** the wizard verifies a Confluence profile
- **THEN** it SHALL authenticate the current user and run the deployment-specific read-only platform preflight without requiring a page locator

#### Scenario: Failed verification
- **WHEN** either probe fails because of authentication, authorization, URL, deployment, DNS, TLS, timeout, rate limit, or server failure
- **THEN** the wizard SHALL classify the failure, redact token and email values, keep the prior workspace unchanged, and offer retry, provider editing, backward navigation, or cancellation

#### Scenario: Concurrent non-overlapping edit
- **WHEN** configuration comments, formatting, unselected profiles, defaults, or another field untouched by the wizard changes before commit
- **THEN** the wizard SHALL apply its changed paths to the latest valid YAML document and preserve the concurrent change

#### Scenario: Concurrent overlapping edit
- **WHEN** both the wizard and another writer change the same semantic field from its original value
- **THEN** the wizard SHALL leave the latest file unchanged and report the exact conflicting field path

#### Scenario: Concurrent reset
- **WHEN** reset mode observes any changed existing configuration before replacement
- **THEN** reset SHALL stop without replacing the file because its intended write covers the complete configuration

#### Scenario: Successful commit
- **WHEN** both probes and strict semantically merged draft validation succeed and the operator confirms saving
- **THEN** the wizard SHALL create runtime directories, atomically replace or create `ywtc.config.yaml`, use user-only permissions for a new file, roll back on persistence failure, and print paths plus the shortest reliable first dry-run command

#### Scenario: Default workspace handoff
- **WHEN** the wizard configured the default workspace
- **THEN** the first dry-run command SHALL contain full source and destination URL placeholders plus `--dry-run` and SHALL omit profile and default-scope options

#### Scenario: Custom workspace handoff
- **WHEN** the wizard configured a workdir that ordinary command resolution would not select automatically
- **THEN** the first dry-run command SHALL additionally include the normalized `--workdir` path and no other optional defaults

#### Scenario: Permission boundary
- **WHEN** connection-only verification succeeds
- **THEN** the result SHALL state that page-specific read and write access is verified later by `doctor` or `migrate`, and the wizard SHALL NOT create, update, or delete remote content

### Requirement: Strict global mention policy
The workspace configuration SHALL accept one optional global mention policy, default it to `off`, and reject unknown modes, fields, placeholders, alias keys, and unsafe URL templates before provider mutation.

#### Scenario: Workspace is initialized
- **WHEN** `ywtc init` creates a new configuration
- **THEN** the generated YAML SHALL include `mentions.mode: off` without example identities, internal domains, or populated personal data

#### Scenario: Template placeholders are valid
- **WHEN** text or URL templates contain only `source`, `username`, `displayName`, `email`, `id`, or `name`
- **THEN** strict configuration parsing SHALL accept them and preserve their literal template values

#### Scenario: Template placeholder is unknown
- **WHEN** a template contains another placeholder or malformed braces
- **THEN** configuration loading SHALL fail before API requests with the exact `mentions` field path and SHALL redact configured identity data where required

#### Scenario: Alias key is invalid
- **WHEN** an alias key does not begin with `username:`, `accountId:`, `userKey:`, or `id:` or has no value
- **THEN** strict configuration loading SHALL reject it before API requests

# workspace-management Delta

## ADDED Requirements

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
The wizard SHALL keep configuration drafts and secrets in memory, perform only authenticated read probes, and persist a strict configuration only after both providers pass verification.

#### Scenario: Yandex Wiki connection probe
- **WHEN** the wizard verifies a Yandex Wiki profile
- **THEN** it SHALL call the current-user endpoint with the configured OAuth or IAM authorization and organization header without requiring a page locator

#### Scenario: Confluence connection probe
- **WHEN** the wizard verifies a Confluence profile
- **THEN** it SHALL authenticate the current user and run the deployment-specific read-only platform preflight without requiring a page locator

#### Scenario: Failed verification
- **WHEN** either probe fails because of authentication, authorization, URL, deployment, DNS, TLS, timeout, rate limit, or server failure
- **THEN** the wizard SHALL classify the failure, redact token and email values, keep the prior workspace unchanged, and offer retry, provider editing, backward navigation, or cancellation

#### Scenario: Successful commit
- **WHEN** both probes and strict draft validation succeed and the operator confirms saving
- **THEN** the wizard SHALL create runtime directories, atomically replace or create `ywtc.config.yaml`, use user-only permissions for a new file, roll back on persistence failure, and print paths plus a profile-specific first dry-run example

#### Scenario: Permission boundary
- **WHEN** connection-only verification succeeds
- **THEN** the result SHALL state that page-specific read and write access is verified later by `doctor` or `migrate`, and the wizard SHALL NOT create, update, or delete remote content

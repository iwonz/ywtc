# workspace-management Delta

## MODIFIED Requirements

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

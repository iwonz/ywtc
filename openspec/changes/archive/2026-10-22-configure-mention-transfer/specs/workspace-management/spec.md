# workspace-management Delta

## ADDED Requirements

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

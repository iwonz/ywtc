## MODIFIED Requirements

### Requirement: Public repository documentation and metadata
The project SHALL identify its MIT license and public repository and SHALL provide concise documentation for purpose, vendor-verified Yandex Wiki and Confluence token acquisition, quick local setup, complete CLI parameter usage, dry-run/live execution, reports, and local development.

#### Scenario: A new operator reads the README
- **WHEN** the repository README is opened
- **THEN** it SHALL present an original full-width thematic header that visibly identifies Yandex Wiki as the migration source and Confluence as the destination, plus a checklist sufficient to obtain least-privilege credentials, configure the environment, dry-run, inspect, and execute a migration

#### Scenario: CLI parameters are inspected
- **WHEN** an operator needs to construct or review a migration command
- **THEN** the README SHALL provide a table covering every supported CLI option with its type, required status, accepted values or format, default, and description

#### Scenario: Token setup is inspected
- **WHEN** an operator follows the authentication sections
- **THEN** the README SHALL distinguish Yandex OAuth and IAM organization/header settings, explain Confluence Data Center PAT creation and permission inheritance, map values to `.env`, and link to official vendor documentation without containing real credentials

#### Scenario: Package metadata is inspected
- **WHEN** package metadata is consumed by development or publication tooling
- **THEN** it SHALL reference `https://github.com/iwonz/ywtc`, the MIT license, and only publishable project files

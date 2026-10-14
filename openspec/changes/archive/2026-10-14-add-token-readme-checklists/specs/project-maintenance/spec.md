## MODIFIED Requirements

### Requirement: Public repository documentation and metadata
The project SHALL identify its MIT license and public repository and SHALL provide concise documentation for purpose, vendor-verified Yandex Wiki and Confluence token acquisition, quick local setup, dry-run/live execution, reports, and local development.

#### Scenario: A new operator reads the README
- **WHEN** the repository README is opened
- **THEN** it SHALL present an original full-width thematic header and a checklist sufficient to obtain least-privilege credentials, configure the environment, dry-run, inspect, and execute a migration

#### Scenario: Token setup is inspected
- **WHEN** an operator follows the authentication sections
- **THEN** the README SHALL distinguish Yandex OAuth and IAM organization/header settings, explain Confluence Data Center PAT creation and permission inheritance, map values to `.env`, and link to official vendor documentation without containing real credentials

#### Scenario: Package metadata is inspected
- **WHEN** package metadata is consumed by development or publication tooling
- **THEN** it SHALL reference `https://github.com/iwonz/ywtc`, the MIT license, and only publishable project files

## MODIFIED Requirements

### Requirement: Public repository documentation and metadata
The project SHALL consistently identify itself as `ywtc`, SHALL identify its MIT license and public repository, and SHALL provide concise documentation for purpose, supported vendor API and product versions, vendor-verified Yandex Wiki and Confluence token acquisition, quick local setup, complete CLI parameter usage, automatic and explicit state management, dry-run/live execution, reports, and local development.

#### Scenario: A new operator reads the README
- **WHEN** the repository README is opened
- **THEN** it SHALL identify the product as `ywtc`, present an original full-width thematic header that visibly identifies Yandex Wiki as the migration source and Confluence as the destination, plus a checklist sufficient to obtain least-privilege credentials, configure the environment, dry-run, inspect, and execute a migration

#### Scenario: CLI help is opened
- **WHEN** an operator runs `ywtc --help` or the equivalent npm command
- **THEN** the heading SHALL lead with the `ywtc` product name and SHALL NOT present an obsolete project name

#### Scenario: Platform compatibility is inspected
- **WHEN** an operator evaluates whether the migrator can work with a specific Yandex Wiki or Confluence installation
- **THEN** the README SHALL identify the supported Yandex Wiki API generation, the documented Confluence Data Center version range and authentication requirement, unsupported Confluence product families, the review date, and the boundary between contract-based automated coverage and live-version certification

#### Scenario: CLI parameters are inspected
- **WHEN** an operator needs to construct or review a migration command
- **THEN** the README SHALL provide one table covering every supported CLI option with its type, required status, concrete accepted values or URL formats, default, and description, including accepted and commonly rejected `--source` and `--target` examples without a duplicate reference section

#### Scenario: State behavior is inspected
- **WHEN** an operator plans repeated, parallel, explicit-state, clean, or upgraded migrations
- **THEN** the README SHALL explain `.states/` automatic paths, isolation between source-target pairs, adoption from previous `.wiki-migration/` state paths, the exact `--state` override, recoverable `--fresh` behavior, dry-run immutability, duplication risk, and state error recovery

#### Scenario: Token setup is inspected
- **WHEN** an operator follows the authentication sections
- **THEN** the README SHALL distinguish Yandex OAuth and IAM organization/header settings, explain Confluence Data Center PAT creation and permission inheritance, map values to `.env`, and link to official vendor documentation without containing real credentials

#### Scenario: Package metadata is inspected
- **WHEN** package metadata is consumed by development or publication tooling
- **THEN** it SHALL name `ywtc`, reference `https://github.com/iwonz/ywtc`, declare the MIT license, and include only publishable project files

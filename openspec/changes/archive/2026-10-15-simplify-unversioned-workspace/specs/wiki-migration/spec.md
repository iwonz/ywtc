# wiki-migration Delta

## MODIFIED Requirements

### Requirement: CLI configuration and preflight
The system SHALL expose transfer through `ywtc migrate`, accept `--source` and `--destination`, resolve provider profiles or a filesystem format from the strict current configuration, validate option combinations, and complete required read-only discovery and capability checks before destination mutation.

#### Scenario: Valid dry-run
- **WHEN** the operator supplies valid endpoints and `--dry-run`
- **THEN** the system SHALL discover, normalize, render, and verify the plan without issuing remote mutation requests or replacing filesystem destinations

#### Scenario: Invalid or legacy invocation
- **WHEN** configuration, locators, profiles, option combinations, or command placement is invalid
- **THEN** the system SHALL exit before mutation with redacted actionable guidance for the current command and options

#### Scenario: Invalid configuration
- **WHEN** a required credential, organization identifier, profile URL, deployment, authentication type, source, destination, scope, or format is invalid
- **THEN** the system SHALL exit non-zero before vendor API mutations, identify the invalid field paths and configuration file, and SHALL NOT reveal secrets

#### Scenario: Legacy direct invocation
- **WHEN** source or destination flags are passed without the `migrate` subcommand
- **THEN** the system SHALL reject the invocation and show current command usage

### Requirement: Configurable network guardrails
The system SHALL enforce independent Yandex Wiki and Confluence request-rate buckets and operation-specific concurrency limits configured in each selected connection in `ywtc.config.yaml`.

#### Scenario: Parallel resource discovery
- **WHEN** migration workers schedule more API operations than a selected connection's configured concurrency
- **THEN** the client SHALL queue excess operations and SHALL NOT exceed the configured limit

#### Scenario: Rate-limit response
- **WHEN** either API returns HTTP 429
- **THEN** all requests to that service SHALL pause for Retry-After when supplied, with a minimum cooldown, before safe retries continue

### Requirement: Publication hygiene
The repository and package SHALL contain only organization-neutral source, empty configuration examples, specifications, and generated library artifacts and SHALL keep populated configuration, credentials, automatic state, cache, and reports inside ignored selected workdirs.

#### Scenario: Public release validation
- **WHEN** a maintainer runs the release check or inspects the packed package
- **THEN** it SHALL permit ignored local workspaces but fail when runtime data is tracked, required ignore rules are absent, or publishable files contain populated tokens, literal authorization credentials, non-example emails, internal domains, or absolute user-home paths

### Requirement: Detailed local migration report
The system SHALL create a self-contained provider-neutral HTML report and downloadable JSON metadata in one strict current unversioned structure for every run.

#### Scenario: Graph and comparison inspection
- **WHEN** an operator opens the report
- **THEN** it SHALL show source/destination profiles and direction, hierarchy and graph edges, cycles, inaccessible/broken links, per-page previews, resources, sizes, degradations, snapshots, conflicts, errors, and output locations without secrets or embedded JSON page bodies

#### Scenario: Report bundle is written
- **WHEN** a dry-run or live transfer reaches report generation
- **THEN** the system SHALL write `index.html` and `report.json` under a unique ignored report directory associated with the selected state

#### Scenario: Migration hierarchy is inspected
- **WHEN** an operator opens the HTML report
- **THEN** the report SHALL show the projected page tree with titles, statuses, source/destination references, resource sizes/counts, link metrics, warnings, conflicts, failures, and stale mappings where applicable

#### Scenario: A page comparison is opened
- **WHEN** an operator selects a page in the HTML report
- **THEN** the report SHALL show sandboxed source and destination previews side by side and identify preview provenance and degradation status

#### Scenario: Metadata is downloaded
- **WHEN** an operator activates the JSON download control
- **THEN** the browser SHALL download metadata for that run without embedding complete source or destination page bodies or an internal schema-version field

#### Scenario: State selection is audited
- **WHEN** a report is generated
- **THEN** its HTML and JSON SHALL identify the credential-free state ID, selected path, selection mode, load source, and fresh backup path when applicable

#### Scenario: Runtime privacy is preserved
- **WHEN** reports are generated or package files are enumerated
- **THEN** report directories SHALL remain ignored by Git, excluded from package publication, and free of credentials and authorization headers

### Requirement: Provider-neutral state and lifecycle
The system SHALL persist canonical endpoint identity, graph edges, fingerprints, page/resource mappings, object statuses, and run lifecycle in one strict current state structure without a schema-version field or compatibility branches.

#### Scenario: Equivalent locators and expanded scope
- **WHEN** repeated runs identify the same endpoints through different supported URL/ID/slug forms or expand the scope
- **THEN** they SHALL select the same automatic state and reuse only valid mapped objects

#### Scenario: Canonical automatic state identity
- **WHEN** an automatic state ID is calculated
- **THEN** it SHALL depend only on canonical source and destination identities, selected profiles, and filesystem format when applicable, and SHALL exclude locator spelling, scope, credentials, and schema labels

#### Scenario: Invalid state structure
- **WHEN** a selected state file is malformed, incomplete, contains unknown fields, or does not match its canonical transfer identity
- **THEN** the system SHALL preserve it unchanged, stop before destination mutation, and report a generic invalid-state error with safe current actions but no conversion behavior

#### Scenario: Destination changed outside ywtc
- **WHEN** a mapped destination fingerprint differs from the last verified value
- **THEN** the object SHALL become a conflict and SHALL NOT be overwritten automatically

#### Scenario: Interrupted run
- **WHEN** SIGINT or SIGTERM occurs
- **THEN** the system SHALL stop scheduling, flush atomic state/report data, mark the run cancelled or interrupted, and return the conventional signal exit code

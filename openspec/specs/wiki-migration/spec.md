# wiki-migration Specification

## Purpose
Provide an organization-agnostic, resumable migration library and CLI for moving accessible Yandex Wiki subtrees into operator-selected Confluence Data Center instances without embedding migration-specific data or credentials.
## Requirements
### Requirement: CLI configuration and preflight
The system SHALL expose migration through `ywtc migrate`, accept a source Wiki slug or URL and a target Confluence page ID or supported URL, validate the workdir configuration and supported deployment/authentication pair, and complete read-only capability preflight checks before creating destination content.

#### Scenario: Valid dry-run
- **WHEN** the operator supplies valid credentials, source, target, and `--dry-run`
- **THEN** the system SHALL discover and analyze the selected scope without issuing Confluence mutation requests

#### Scenario: Invalid configuration
- **WHEN** a required credential, organization identifier, URL, deployment, authentication type, source, or target is invalid
- **THEN** the system SHALL exit non-zero before vendor API mutations, identify the invalid fields and corrective action, and SHALL NOT reveal secrets

#### Scenario: Legacy direct invocation
- **WHEN** source or target flags are passed without the `migrate` subcommand
- **THEN** the system SHALL reject the invocation with v2 command guidance

### Requirement: Hierarchical page migration
The system SHALL create the source root below the selected target and preserve the accessible parent-child hierarchy for all migrated descendants.

#### Scenario: Nested subtree
- **WHEN** a source section contains multiple page levels
- **THEN** every migrated page SHALL have the corresponding migrated parent in Confluence

### Requirement: Content and resource fidelity
The system SHALL convert current YFM content to valid Confluence storage format and migrate downloadable attachments, embedded Wiki images, internal links, tables, and static snapshots of dynamic grids.

#### Scenario: Internal links and attachments
- **WHEN** a page references another page in the selected subtree and a downloadable attachment
- **THEN** the final Confluence body SHALL reference the migrated page and uploaded attachment rather than the original internal resource

#### Scenario: Legacy inline formatting and implicit links
- **WHEN** source content contains a bare HTTP(S) URL, legacy Wiki text color, checklist item, explicit anchor, ordered-list start, or image dimensions
- **THEN** the final Confluence body SHALL use the closest native clickable or formatted Storage Format representation and SHALL NOT expose supported markup tokens as literal text

#### Scenario: Unsupported rich content
- **WHEN** a YFM construct has no standard Confluence equivalent
- **THEN** the system SHALL preserve a readable static or source-text fallback and record a degradation warning

### Requirement: Safe conflicts and reruns
The system SHALL use stable title suffixes for collisions, SHALL automatically select isolated resumable state under the selected workdir's `.states/` for each canonical source-target pair unless explicitly overridden, and SHALL persist enough state to resume or rerun without duplicating previously mapped content.

#### Scenario: Duplicate title
- **WHEN** a source title conflicts with another source page or an existing destination-space title
- **THEN** the system SHALL choose a deterministic suffixed title and record the rename

#### Scenario: Interrupted migration
- **WHEN** a prior current-version run created pages or attachments and then stopped
- **THEN** a rerun with the same canonical source and target SHALL find the selected workdir's `.states/<state-id>.json` and update those mapped objects instead of creating duplicates

#### Scenario: Equivalent Data Center input forms
- **WHEN** repeated Data Center runs identify the same resolved Yandex page and Confluence target through different supported slug, ID, or URL forms
- **THEN** the system SHALL preserve the existing canonical state identifier without including credentials

#### Scenario: Cloud identity
- **WHEN** a Cloud migration resolves its destination
- **THEN** its canonical state identity SHALL include deployment, Cloud instance, space ID, and target page ID to avoid collisions with Data Center or another Cloud space

#### Scenario: Independent migrations
- **WHEN** the source page, Yandex organization, Yandex instance, Confluence deployment or instance, Confluence space, or Confluence target page differs
- **THEN** the system SHALL select a different automatic state file and SHALL NOT overwrite the other migration's state

#### Scenario: Explicit state override
- **WHEN** the operator supplies a non-empty `--state` path inside the selected workdir
- **THEN** the system SHALL use exactly that resolved path and SHALL reject a valid state belonging to another source-target identity with corrective guidance

#### Scenario: Clean live run
- **WHEN** the operator supplies `--fresh` for a live migration
- **THEN** the system SHALL ignore prior mappings, preserve an existing selected state as a recoverable backup, start an empty selected state, and warn that destination duplicates or suffixed titles may result

#### Scenario: Clean dry-run
- **WHEN** the operator combines `--fresh` with `--dry-run`
- **THEN** the system SHALL analyze with empty in-memory mappings without creating, moving, backing up, or updating a state file

#### Scenario: Invalid state data
- **WHEN** a selected state file is unreadable, malformed, unsupported, outside the workdir, or owned by another migration
- **THEN** the system SHALL exit before destination mutations and identify the affected path plus safe recovery actions without revealing credentials

### Requirement: Reliability and auditability
The system SHALL apply bounded retries to transient API failures, atomically persist state after mutations, verify destination objects, and produce a per-run HTML and JSON report bundle.

#### Scenario: Transient API error
- **WHEN** an API returns 429, 5xx, or a retriable network error
- **THEN** the system SHALL retry within configured bounds and respect Retry-After when supplied

#### Scenario: Partial failure
- **WHEN** one page or resource cannot be migrated
- **THEN** the system SHALL record the failure in report metadata and the HTML status interface, continue independent work where safe, and exit non-zero

### Requirement: Configurable network guardrails
The system SHALL enforce independent Yandex Wiki and Confluence request-rate buckets and operation-specific concurrency limits configured through environment variables.

#### Scenario: Parallel resource discovery
- **WHEN** migration workers schedule more API operations than the configured service concurrency
- **THEN** the client SHALL queue excess operations and SHALL NOT exceed the configured limit

#### Scenario: Rate-limit response
- **WHEN** either API returns HTTP 429
- **THEN** all requests to that service SHALL pause for Retry-After when supplied, with a minimum cooldown, before safe retries continue

### Requirement: Observable migration progress
The CLI SHALL show a pre-mutation transfer plan and continuously report overall completion with the specific page or attachment processed.

#### Scenario: Preflight completes
- **WHEN** the source tree and resources have been inspected
- **THEN** the CLI and report SHALL include measurable page, attachment, byte, link, image, table, grid-row, code-block, rename, and warning counts

#### Scenario: Migration is running
- **WHEN** a page skeleton, attachment, or final page body completes, fails, is reused, or is skipped
- **THEN** the CLI SHALL update the overall percentage and identify the affected object and outcome

### Requirement: Non-destructive behavior
The system MUST NOT delete destination content, adopt unrelated pages implicitly, or store credentials in state and reports.

#### Scenario: Source page removed after migration
- **WHEN** a previously migrated source page is absent on a later run
- **THEN** the destination page SHALL remain untouched and the report SHALL identify it as stale

### Requirement: Publication hygiene
The repository and package SHALL contain only organization-neutral source, examples, specifications, and generated library artifacts and SHALL keep credentials plus automatic state, cache, and reports inside ignored selected workdirs.

#### Scenario: Public release validation
- **WHEN** a maintainer runs the release check or inspects the packed package
- **THEN** it SHALL permit ignored local workspaces but fail when runtime data is tracked, required ignore rules are absent, or publishable files contain private keys, filled credential variables, literal authorization credentials, non-example emails, internal domains, or absolute user-home paths

### Requirement: Detailed local migration report
The system SHALL create one ignored report directory per run containing a self-contained HTML report and downloadable JSON metadata, without credentials or authorization headers, and SHALL keep report placement stable inside the current runtime state root.

#### Scenario: Report bundle is written
- **WHEN** a dry-run or live migration reaches report generation
- **THEN** the system SHALL write `index.html` and `report.json` under a unique directory in `.states/reports` for automatic state or the explicit state file's sibling `reports` directory

#### Scenario: Migration hierarchy is inspected
- **WHEN** an operator opens the HTML report
- **THEN** the report SHALL show nested source pages with titles, statuses, source and destination references, resource counts and sizes, link/image/table/code metrics, warnings, errors, and stale destination mappings where applicable

#### Scenario: A page comparison is opened
- **WHEN** an operator selects a page in the HTML report
- **THEN** the report SHALL show sandboxed source and destination content previews side by side and identify whether the destination came from Confluence rendered view or a local dry-run fallback

#### Scenario: Metadata is downloaded
- **WHEN** an operator activates the JSON download control
- **THEN** the browser SHALL download the metadata for that report without embedding source or destination page bodies in the JSON

#### Scenario: State selection is audited
- **WHEN** a report is generated
- **THEN** its HTML and JSON metadata SHALL identify the credential-free state ID, selected path, selection mode, current load source, and fresh backup path when applicable

#### Scenario: Runtime privacy is preserved
- **WHEN** reports are generated with the default state location or package files are enumerated
- **THEN** report folders SHALL remain ignored by Git and excluded from package publication

### Requirement: Selectable migration scope
The system SHALL migrate the complete accessible subtree by default and SHALL provide an explicit single-page mode that selects only the exact source page while preserving all supported content and resources belonging to that page.

#### Scenario: Default subtree scope
- **WHEN** the operator starts a migration without the single-page option
- **THEN** the system SHALL discover and migrate the accessible source root and its descendants with their hierarchy preserved

#### Scenario: Single-page scope
- **WHEN** the operator supplies `--single-page`
- **THEN** the system SHALL migrate only the exact source page, SHALL report one selected page and zero descendants, and SHALL NOT request or create descendant pages

#### Scenario: Link leaves the selected scope
- **WHEN** the selected page links to an unselected descendant or any other Wiki page outside the active scope
- **THEN** the system SHALL keep that link pointing to Yandex Wiki rather than rewriting it as a migrated Confluence page link

#### Scenario: Single-page rerun with shared state
- **WHEN** single-page mode reuses state that contains mappings for the source root and prior descendants
- **THEN** the system SHALL resume or update only the selected root mapping and SHALL NOT mark, update, move, or delete the unselected descendant mappings or destination pages

### Requirement: Observable state selection
The system SHALL explain automatic, explicit, existing, new, and fresh state behavior in CLI output and per-run report metadata.

#### Scenario: Automatic state is resolved
- **WHEN** source and target preflight resolve canonical page identities
- **THEN** the CLI SHALL display the selected state identifier and `.states/<state-id>.json` path before destination mutations

#### Scenario: State is reused or backed up
- **WHEN** a run loads current state or a fresh run backs up selected state
- **THEN** the CLI and report SHALL identify the action and relevant non-secret current paths

### Requirement: Deployment-specific Confluence compatibility
The system SHALL support Confluence Data Center 7.9 or newer through `/rest/api` with Bearer PAT and Confluence Cloud through REST v2 page/space APIs plus REST v1 multipart attachments with Basic email/API-token authentication.

#### Scenario: Supported Data Center
- **WHEN** `CONFLUENCE_DEPLOYMENT=data-center` and `CONFLUENCE_AUTH_TYPE=pat`
- **THEN** preflight SHALL attempt to obtain server information, reject an identified version below 7.9, and verify the REST/storage capabilities used by migration without imposing an upper version boundary; when server information is not exposed to the user, successful required capability probes SHALL permit the run with an unknown version

#### Scenario: Supported Cloud
- **WHEN** `CONFLUENCE_DEPLOYMENT=cloud`, `CONFLUENCE_AUTH_TYPE=api-token`, and an email is supplied
- **THEN** the Cloud adapter SHALL use Basic authentication, REST v2 for pages/spaces, REST v1 for attachments, and normalize responses for the common migration pipeline

#### Scenario: Unsupported Confluence profile
- **WHEN** configuration selects Confluence Server, Data Center Basic Auth, Cloud PAT, or another unsupported pair
- **THEN** validation SHALL fail before API requests with distinct deployment, version, authentication, target URL, or missing-capability diagnostics as applicable

#### Scenario: Capability drift
- **WHEN** the configured server responds but a required page, space, storage, update, or attachment contract is unavailable
- **THEN** preflight SHALL stop before destination mutations with the failed capability and compatibility guidance

### Requirement: Tolerant Yandex Wiki Public API validation
The Yandex client SHALL support Public API v1 with OAuth or IAM and `X-Org-Id` or `X-Cloud-Org-Id`, accept unknown optional response fields, and diagnose missing or invalid required page, resource, descendant, and Grid structures.

#### Scenario: Additive API change
- **WHEN** a valid Public API v1 response includes new optional fields
- **THEN** the client SHALL accept the response and continue using the required normalized fields

#### Scenario: Required structure missing
- **WHEN** a page, descendant, resource, or Grid response lacks a required structure
- **THEN** the client SHALL report the endpoint and schema problem without logging authorization data

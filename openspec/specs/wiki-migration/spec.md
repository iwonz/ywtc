# wiki-migration Specification

## Purpose
Provide an organization-agnostic, resumable migration library and CLI for moving accessible Yandex Wiki subtrees into operator-selected Confluence Data Center instances without embedding migration-specific data or credentials.

## Requirements

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

### Requirement: Hierarchical page migration
The system SHALL create the source root below the selected remote destination, preserve a selected source parent when available, and attach a selected linked page without a selected parent directly below the migrated root.

#### Scenario: Mixed structural and linked pages
- **WHEN** selected pages contain descendants and links to pages whose source parent is not selected
- **THEN** structural descendants SHALL retain their selected parent and linked orphans SHALL become children of the migrated root

#### Scenario: Nested subtree
- **WHEN** a selected subtree contains multiple page levels
- **THEN** every transferred page SHALL retain its corresponding selected parent under the destination root

### Requirement: Content and resource fidelity
The system SHALL preserve supported headings, paragraphs, lists, quotes, code, tables, grids, notes, cuts, tabs, links, anchors, images, and streamed attachments through the closest safe destination representation.

#### Scenario: Internal references and resources
- **WHEN** a page references another selected page, anchor, image, or downloadable attachment
- **THEN** the rendered destination SHALL use the resolved destination page, anchor, and resource location rather than a stale source-internal reference

#### Scenario: Unsupported rich content
- **WHEN** a construct cannot be represented natively
- **THEN** the system SHALL provide a readable fallback, retain raw source for that page, and record the degradation

#### Scenario: Internal links and attachments
- **WHEN** a page references another selected page and a downloadable attachment
- **THEN** the final body SHALL reference the transferred page and copied attachment rather than a stale source-internal resource

#### Scenario: Legacy inline formatting and implicit links
- **WHEN** source content contains a bare HTTP(S) URL, vendor text color, checklist item, explicit anchor, ordered-list start, or image dimensions
- **THEN** the final destination SHALL use the closest safe clickable or formatted representation and SHALL NOT expose supported markup tokens as literal text

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
The system SHALL apply bounded retries, stream large resources, atomically checkpoint every successful mutation, verify destination objects, and produce provider-neutral HTML and JSON reports.

#### Scenario: Partial failure
- **WHEN** one page, resource, render, or verification step fails
- **THEN** independent work MAY continue, the object and run SHALL be marked partial or failed, and the process SHALL exit non-zero with resume guidance

#### Scenario: Transient API error
- **WHEN** an API returns 429, 5xx, Retry-After, or a retriable network error
- **THEN** the system SHALL retry within configured bounds and respect the service cooldown before safe retries continue

### Requirement: Configurable network guardrails
The system SHALL enforce independent Yandex Wiki and Confluence request-rate buckets and operation-specific concurrency limits configured in each selected connection in `ywtc.config.yaml`.

#### Scenario: Parallel resource discovery
- **WHEN** migration workers schedule more API operations than a selected connection's configured concurrency
- **THEN** the client SHALL queue excess operations and SHALL NOT exceed the configured limit

#### Scenario: Rate-limit response
- **WHEN** either API returns HTTP 429
- **THEN** all requests to that service SHALL pause for Retry-After when supplied, with a minimum cooldown, before safe retries continue

### Requirement: Observable migration progress
The CLI SHALL show live discovery totals, an exact post-discovery transfer plan, object/byte progress, and one consistent terminal summary for TTY and non-TTY environments.

#### Scenario: Discovery and completion
- **WHEN** a transfer runs
- **THEN** output SHALL identify the active phase and object, selected pages and graph edges, content/resources completed or failed, final status, result paths or URLs, state/report paths, and any required next action

#### Scenario: Preflight completes
- **WHEN** the source graph and resources have been inspected
- **THEN** the CLI and report SHALL include measurable page, attachment, byte, link, image, table, grid-row, code-block, degradation, and warning counts

#### Scenario: Migration is running
- **WHEN** a page skeleton, resource, or final page body completes, fails, conflicts, is reused, or is skipped
- **THEN** the CLI SHALL update overall progress and identify the affected object and outcome

### Requirement: Non-destructive behavior
The system MUST NOT delete destination content, adopt unrelated pages implicitly, or store credentials in state and reports.

#### Scenario: Source page removed after migration
- **WHEN** a previously migrated source page is absent on a later run
- **THEN** the destination page SHALL remain untouched and the report SHALL identify it as stale

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

### Requirement: Selectable migration scope
The system SHALL expose `--scope page|subtree|linked`, default to `subtree`, and freeze the selected set before destination mutation.

#### Scenario: Page scope
- **WHEN** `--scope page` is selected
- **THEN** only the resolved root page and its resources SHALL be transferred

#### Scenario: Subtree scope
- **WHEN** scope is omitted or `--scope subtree` is selected
- **THEN** the root and all accessible structural descendants SHALL be transferred

#### Scenario: Linked scope
- **WHEN** `--scope linked` is selected
- **THEN** the root and every accessible same-boundary page transitively referenced from selected page content or page-reference/include constructs SHALL be transferred without a depth limit

#### Scenario: Default subtree scope
- **WHEN** the operator starts a transfer without `--scope`
- **THEN** the system SHALL discover and transfer the accessible source root and structural descendants with their hierarchy preserved

#### Scenario: Single-page scope
- **WHEN** the operator supplies `--scope page`
- **THEN** the system SHALL transfer only the exact source page and its resources and SHALL NOT request or create descendant pages

#### Scenario: Link leaves the selected scope
- **WHEN** a selected page links to an accessible page outside `page` or `subtree` scope
- **THEN** the system SHALL keep or safely normalize that link as an external source reference rather than rewriting it to a nonexistent destination page

#### Scenario: Single-page rerun with shared state
- **WHEN** page scope reuses state containing mappings for the source root and prior descendants
- **THEN** the system SHALL resume or update only the selected root mapping and SHALL NOT mark, update, move, or delete unselected mappings or destination pages

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

### Requirement: Provider-neutral transfer directions
The system SHALL transfer current accessible pages and resources for Yandex Wiki to Confluence, Yandex Wiki to Yandex Wiki, Confluence to Yandex Wiki, and Confluence to Confluence, including distinct configured instances of the same provider.

#### Scenario: Direction-specific preflight
- **WHEN** an operator selects source and destination profiles
- **THEN** the system SHALL validate source read capabilities and destination create/update/resource capabilities before mutation

#### Scenario: Self-copy protection
- **WHEN** the resolved destination is the source page or belongs to the selected source graph on the same instance
- **THEN** the system SHALL reject the operation before destination mutation

### Requirement: Normalized loss-aware content pipeline
The system SHALL normalize source content into typed structural, page-reference, resource, and vendor-extension nodes and SHALL render each node natively, as a readable fallback, or with a retained raw source snapshot.

#### Scenario: Cross-provider degradation
- **WHEN** a source construct has no destination equivalent
- **THEN** the destination SHALL contain a readable fallback, the raw source SHALL be recoverable, and the report SHALL identify the degradation

#### Scenario: Unaccounted source data
- **WHEN** content or a resource is neither represented nor recoverably snapshotted
- **THEN** the page SHALL NOT be marked complete and the run SHALL exit non-zero

### Requirement: Graph-safe linked discovery
The system SHALL discover transitive internal page references for linked scope until a fixed point and SHALL process each canonical page identity at most once.

#### Scenario: Cyclic graph
- **WHEN** linked pages contain self-links, diamonds, redirects, or cycles
- **THEN** discovery SHALL terminate deterministically, record edge statuses, and SHALL NOT create duplicate destination pages

#### Scenario: Link boundary
- **WHEN** a link targets another origin, organization, binary resource, comment, unsupported reference, inaccessible page, or missing page
- **THEN** the system SHALL keep or safely degrade the original reference, record its edge status, and SHALL NOT enqueue it as an accessible internal page

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

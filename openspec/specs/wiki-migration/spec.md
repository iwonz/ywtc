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
The CLI SHALL continuously identify the active transfer phase and work, show exact completed/total counters where totals are known, and provide one consistent terminal summary in TTY and non-TTY environments without counting in-flight work as complete.

#### Scenario: Discovery and completion
- **WHEN** a transfer runs
- **THEN** output SHALL identify the active phase and object, selected pages and graph edges, content/resources completed or failed, final status, result paths or URLs, state/report paths, and any required next action

#### Scenario: Preflight completes
- **WHEN** the source graph and resources have been inspected
- **THEN** the CLI and report SHALL include measurable page, attachment, byte, link, image, table, grid-row, code-block, degradation, and warning counts

#### Scenario: Migration is running
- **WHEN** a page skeleton, resource, final page body, comment archive, or verification completes, fails, conflicts, is reused, or is skipped
- **THEN** the CLI SHALL update the corresponding completed/total counters and identify the affected object and outcome

#### Scenario: Long operation has no completion event
- **WHEN** a network request, provider retry, render, upload, comment operation, verification, or export step remains in flight longer than the progress heartbeat interval
- **THEN** the CLI SHALL refresh the current phase, a bounded sample and count of active objects, elapsed time, and time since the last confirmed completion without advancing any completed counter

#### Scenario: Non-interactive output
- **WHEN** progress is rendered without an interactive terminal
- **THEN** heartbeat records SHALL be rate-limited, line-oriented, and contain the same phase, counter, active-work, and timing meaning as interactive output

#### Scenario: Transfer terminates
- **WHEN** a transfer succeeds, fails, is cancelled, or is interrupted by a signal
- **THEN** progress heartbeat activity SHALL stop before the command returns and SHALL NOT keep the process alive

#### Scenario: Status label contains unsafe or excessive text
- **WHEN** an active page, resource, or provider diagnostic contains control characters, line breaks, ANSI escapes, or an excessively long label
- **THEN** live progress SHALL show a single-line bounded label without exposing credentials or disrupting terminal rendering

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
The system SHALL persist canonical endpoint identity, graph edges, confirmed destination fingerprints and versions, page/resource mappings, object statuses, and run lifecycle in one strict current state structure without a schema-version field or compatibility branches.

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
- **WHEN** a proven mapped destination fingerprint or provider version differs from the last verified value
- **THEN** the system SHALL treat the source as authoritative, update or semantically reuse the mapped object, and preserve prior destination content through provider history without conflict

#### Scenario: Destination ownership is uncertain
- **WHEN** the provider result makes a state mapping ambiguous or unable to prove a unique destination identity
- **THEN** the object SHALL become a conflict and SHALL NOT be overwritten automatically

#### Scenario: Interrupted run
- **WHEN** SIGINT or SIGTERM occurs
- **THEN** the system SHALL stop scheduling, flush atomic state/report data, mark the run cancelled or interrupted, and return the conventional signal exit code

### Requirement: Source-derived remote page creation
Every newly created remote page SHALL contain a complete source-derived body or a readable raw-content fallback from its first persisted version and SHALL NOT contain a transfer-progress placeholder.

#### Scenario: Destination mappings are not yet available
- **WHEN** a selected page must be created before all destination page IDs and attachments exist
- **THEN** its bootstrap body SHALL contain all available source content while unresolved internal pages and resources remain usable source references or explicit readable fallbacks

#### Scenario: Renderer cannot produce the preferred representation
- **WHEN** preferred destination rendering fails for a source page before creation
- **THEN** the system SHALL use a destination-safe visible representation of the complete raw source and record a degradation instead of creating a progress-only page

### Requirement: Resource-independent page completion
The system SHALL process each resource independently and SHALL persist and verify the page body even when individual resource transfers fail.

#### Scenario: Attachment transfer fails
- **WHEN** downloading, uploading, or verifying one attachment or image fails
- **THEN** other resources and the page body SHALL continue, the failed reference SHALL use its source URL or a readable fallback, and the page SHALL be partial with retryable resource state

#### Scenario: Final refinement fails
- **WHEN** a final body update or optional raw-snapshot upload fails after a source-derived bootstrap body was created
- **THEN** the bootstrap content SHALL remain intact and the page SHALL be partial unless its actual body cannot be verified

### Requirement: Destination content verification
A remote page SHALL be complete only after provider-aware verification re-reads its destination body and proves all meaningful source information is present; representational adaptations do not make an otherwise complete page partial.

#### Scenario: Destination returns incomplete content
- **WHEN** the re-read body is empty unexpectedly, a transfer placeholder, missing meaningful text or structure, or contains unaccounted source data
- **THEN** the page SHALL be failed and the run SHALL exit non-zero with the affected page and report location

#### Scenario: Body succeeds with resource fallback
- **WHEN** the re-read body contains the represented source content but one or more managed resources use recorded source fallbacks
- **THEN** the page SHALL be partial rather than failed or complete

#### Scenario: Destination applies safe normalization
- **WHEN** the destination changes whitespace, entities, namespace or attribute ordering, removes empty nodes or service anchor spans, or adds allowed provider attributes
- **THEN** verification SHALL accept the body as complete when its meaningful text, blocks, references, tables, code, and macros remain equivalent

#### Scenario: Destination applies lossless adaptation
- **WHEN** all data and meaningful references remain represented but the destination changes layout, presentation, or interactive behavior through a documented static equivalent
- **THEN** verification SHALL return complete and record an adaptation

#### Scenario: Destination applies meaningful simplification
- **WHEN** destination simplification omits meaningful source information or cannot be semantically verified
- **THEN** verification SHALL return partial and identify the degradation

#### Scenario: Destination preview is reported
- **WHEN** a page body has been verified or rejected
- **THEN** its report comparison SHALL use the body actually read from the destination rather than the body submitted by ywtc

### Requirement: Generated placeholder recovery
The system SHALL repair mapped pages whose current body exactly matches a ywtc-generated transfer placeholder and SHALL otherwise apply the source-authoritative mapped update policy.

#### Scenario: Unchanged generated placeholder is resumed
- **WHEN** a mapped destination page still contains the exact generated placeholder and retains its expected mapped identity
- **THEN** a rerun SHALL replace it with source-derived content without creating a duplicate page

#### Scenario: Destination was edited manually
- **WHEN** the proven mapped destination title or body differs from both the stored fingerprint and the exact generated placeholder
- **THEN** the system SHALL apply the current source-derived title and body as a new verified destination version without conflict

#### Scenario: Placeholder ownership cannot be proven
- **WHEN** ywtc cannot prove that a placeholder or candidate destination page belongs to the selected source mapping
- **THEN** it SHALL preserve the candidate unchanged and report an ownership conflict

### Requirement: Terminal report access
The CLI SHALL expose safe report listing and opening commands and SHALL print a clickable local URL whenever a run produces an HTML report.

#### Scenario: Transfer report is produced
- **WHEN** a migration finishes as completed, partial, failed, cancelled, or interrupted and an HTML report was written
- **THEN** terminal output SHALL include its run ID, filesystem path, `file://` URL, and an exact workspace-aware `ywtc reports open <run-id>` command, and `--open-report` SHALL attempt to open it without changing the migration result if opening fails

#### Scenario: Reports are listed
- **WHEN** the operator runs `ywtc reports list`
- **THEN** valid report bundles SHALL be listed newest first with run ID, time, direction, scope, status, page counts, issue counts, and path while malformed bundles are skipped with a warning

#### Scenario: A report is opened
- **WHEN** the operator runs `ywtc reports open [run-id|last]`
- **THEN** the requested valid report, or newest valid report when `last` or no selector is supplied, SHALL open through the operating system without permitting path traversal outside the selected workdir

#### Scenario: Report cannot be opened
- **WHEN** no valid report exists, the run ID is invalid, or the operating system opener fails
- **THEN** the command SHALL fail with an actionable redacted diagnostic and print the local URL when one is available

### Requirement: Collision-safe resource identity and reconciliation
The system SHALL identify source resources independently of display filenames, resolve exact aliases before ambiguous basenames, reserve names case-insensitively, and repeatedly reconcile collisions by immutable mapping or verified content.

#### Scenario: Provider returns duplicate API names
- **WHEN** multiple source resources have the same API name but distinct download URLs or immutable IDs
- **THEN** each resource SHALL receive a deterministic unique destination name and every source reference SHALL resolve to its corresponding resource

#### Scenario: Destination filename is already occupied
- **WHEN** the preferred destination filename belongs to an unrelated resource
- **THEN** the system SHALL preserve that resource and choose a deterministic suffixed name for the source resource

#### Scenario: Upload result is ambiguous
- **WHEN** an upload response is lost or the destination reports an existing same-name attachment
- **THEN** the system SHALL refresh reserved names, stream and compare size plus SHA-256 where permitted, adopt only an exact match, and otherwise continue with the next deterministic name

#### Scenario: Append-only destination resource changes
- **WHEN** a mapped source resource changes and the destination cannot update its existing attachment
- **THEN** the system SHALL create a deterministic hash-named resource, update the mapping, and leave the old object untouched

#### Scenario: Partial resource state is resumed
- **WHEN** a prior run downloaded a resource or stored a failed resource mapping
- **THEN** the next run SHALL verify and reuse the cache, replan unsafe names, and retry without requiring `--fresh` or creating duplicate verified attachments

### Requirement: Confirmed destination mapping consistency recovery
The system SHALL apply bounded consistency retries only to destination page IDs previously confirmed by state, create, or update and SHALL recover a persistently missing mapping without deleting content.

#### Scenario: Confirmed page is temporarily unavailable
- **WHEN** reads of a previously confirmed destination ID return transient `404` responses before becoming readable
- **THEN** the system SHALL retry with bounded jittered backoff and continue with the original mapping

#### Scenario: Confirmed page remains unavailable
- **WHEN** consistency retries for a previously confirmed ID are exhausted
- **THEN** the system SHALL search under the expected parent for matching source-derived content, adopt a confirmed match, or recreate the page with bootstrap content and retain the prior ID in state history

#### Scenario: Recovery lookup is unavailable
- **WHEN** the expected parent was confirmed but a provider's candidate or collision lookup fails independently of page creation
- **THEN** the system SHALL record the lookup failure, attempt safe bootstrap recreation, verify the created page, and SHALL NOT adopt an unverified candidate

#### Scenario: Missing subtree is recreated
- **WHEN** the root and descendants represented by current state are no longer available at the destination
- **THEN** the system SHALL recreate the root before its descendants, restore the selected hierarchy, reset stale resource mappings, and checkpoint every verified replacement ID

#### Scenario: Missing page is recreated
- **WHEN** a destination page is recreated after a persistent missing mapping
- **THEN** its old attachment mappings SHALL be reset, verified cache files SHALL be reused, and its expected hierarchy SHALL be restored where supported

#### Scenario: Provider normalizes bootstrap markup
- **WHEN** the destination rewrites page serialization between verified bootstrap creation and final rendering
- **THEN** the system SHALL continue only if provider-aware semantic verification finds no meaningful content or structure change, record a safe normalization, and retain conflict protection for any meaningful difference

#### Scenario: Raw source snapshot already exists
- **WHEN** a page requires a raw fallback snapshot and the destination page already contains the deterministic snapshot filename while state lacks a usable attachment mapping
- **THEN** the system SHALL verify and adopt or safely update that attachment instead of attempting a duplicate create, and SHALL report a transfer error if reconciliation cannot prove or write the snapshot

#### Scenario: Parent or recreation cannot be confirmed
- **WHEN** the expected parent is unavailable or the recreated page cannot be read back
- **THEN** the page SHALL be blocked or failed, no destination object SHALL be deleted, and no unrelated page SHALL be adopted

#### Scenario: New locator is missing
- **WHEN** a source or destination locator that has never been confirmed returns `404`
- **THEN** the system SHALL fail that resolution without applying consistency retries or creating a replacement

### Requirement: Explicit content normalizations and degradations
The system SHALL distinguish safe provider normalizations, lossless adaptations, and meaningful information loss without deriving impact from free-form warning text.

#### Scenario: Empty source heading is removed
- **WHEN** source conversion produces a heading with no title or meaningful content
- **THEN** the system SHALL remove only that heading, preserve neighboring anchors, strip terminal control codes from its diagnostic, and record a safe normalization without making the page partial

#### Scenario: Formatting structure is adapted without losing information
- **WHEN** a destination reshapes a layout, heading, list, tab set, media embed, or formula while retaining its complete ordered payload and references
- **THEN** verification SHALL record an adaptation and the page SHALL remain complete

#### Scenario: Formatting structure is simplified without losing data
- **WHEN** a destination changes non-empty formatting while retaining the complete ordered information and references
- **THEN** verification SHALL record an adaptation rather than degradation and the page SHALL remain complete

#### Scenario: Dynamic table is materialized
- **WHEN** a dynamic table is rendered as a static destination table
- **THEN** every source row, cell value, and representable reference SHALL be verified and the page SHALL remain complete with an adaptation notice

#### Scenario: Meaningful data is lost
- **WHEN** the destination omits text, a table cell, code block, link, image, attachment reference, anchor, meaningful macro payload, or comment
- **THEN** verification SHALL report data loss and the page SHALL fail or remain partial according to whether a complete readable body still exists

#### Scenario: Storage normalization preserves XML-safe void elements
- **WHEN** empty headings are removed from Confluence Storage Format containing void elements such as line breaks or horizontal rules
- **THEN** the normalized output SHALL retain XML-safe self-closing syntax accepted by Confluence

### Requirement: Native tree directive representation
The system SHALL recognize YFM tree directives as typed navigation content and render them without a raw-only fallback.

#### Scenario: Tree is transferred to Confluence
- **WHEN** a YFM page contains a supported tree directive
- **THEN** Confluence output SHALL contain a native children macro with corresponding depth and sort settings

#### Scenario: Tree remains in Yandex Wiki
- **WHEN** a YFM page containing a tree directive is transferred to Yandex Wiki
- **THEN** the original supported directive SHALL be preserved

#### Scenario: Directive is unsupported
- **WHEN** a vendor directive cannot be represented natively or materialized
- **THEN** the output SHALL contain a readable fallback, retain raw source, and record a real degradation

### Requirement: Unified migration issue accounting
The system SHALL derive terminal, state, report, and catalog counts from one deduplicated typed issue and transformation-notice collection rather than parsing diagnostic messages.

#### Scenario: Operation is retried
- **WHEN** one resource or page operation emits the same issue during retries or fallback handling
- **THEN** the report SHALL count the issue once per code and affected object while retaining retryability and final outcome

#### Scenario: Report counters are inspected
- **WHEN** an operator compares terminal output, state, JSON/HTML report, and `reports list`
- **THEN** error, warning, degradation, adaptation, normalization, and retryable-failure counts SHALL agree and remain mutually distinct

#### Scenario: Resource bytes are reported
- **WHEN** resource metadata is absent or inaccurate but a file is downloaded or verified
- **THEN** byte totals SHALL use the actual persisted size and represent unavailable sizes as unknown rather than zero

### Requirement: Reconciled source-to-outcome reporting
Every run report SHALL distinguish the accessible content selected from the source from the outcome produced for each selected page and transferable resource. Counts in HTML, JSON, terminal summaries, and the report catalog MUST use the same definitions and reconcile without silently treating unknown or unprocessed objects as successful.

#### Scenario: Source scope inventory completes
- **WHEN** discovery and inventory complete for the selected scope
- **THEN** the report SHALL identify that scope as accessible selected source content and count pages, attachments, images, grids, known bytes, unknown sizes, links, tables, and code blocks before presenting transfer outcomes

#### Scenario: Page and resource outcomes are reconciled
- **WHEN** a run finishes in any terminal status
- **THEN** every selected page and transferable resource SHALL appear in exactly one current outcome status, the status totals SHALL equal the corresponding source totals, and unprocessed, blocked, conflicted, partial, or failed objects SHALL NOT be counted as complete

#### Scenario: Transferred bytes are reported
- **WHEN** resources have complete, partial, failed, planned, or unknown outcomes
- **THEN** transferred bytes SHALL include only resources confirmed complete, source bytes SHALL use verified downloaded size when available or source metadata otherwise, and unknown sizes SHALL remain explicitly unknown

#### Scenario: Inventory is incomplete
- **WHEN** source discovery or inventory fails before every selected object is inspected
- **THEN** the report SHALL retain every source page known at that point, identify which inventory values are incomplete, and SHALL NOT represent missing measurements as successful zero counts

#### Scenario: Existing state is analyzed in dry-run
- **WHEN** a dry-run loads earlier page or resource mappings and current validation produces planned, blocked, conflicted, or failed outcomes
- **THEN** the report SHALL show the current dry-run outcome for every object, SHALL NOT restore an earlier successful status, and SHALL report zero transferred bytes

### Requirement: Actionable report problem context
The report SHALL make blocking errors, retryable failures, degradations, warnings, and safe normalizations distinguishable and SHALL identify the affected page or resource whenever that context is known.

#### Scenario: Operator opens a report with problems
- **WHEN** the report contains an error, conflict, resource fallback, retryable failure, or degradation
- **THEN** a needs-attention summary SHALL appear before the page tree with severity, phase, reason, retryability, occurrence count, affected page title, affected resource name when applicable, and navigation to page details

#### Scenario: Operator inspects a page
- **WHEN** a selected page is expanded in the HTML report
- **THEN** it SHALL show its exact status, parent/depth, source and destination references, content metrics, resource outcomes and sizes, page-specific issues, fallbacks, normalizations, and available source/destination previews

#### Scenario: Link traversal was not collected
- **WHEN** page or subtree scope has content links but no linked-scope traversal edges
- **THEN** the report SHALL explain that traversal edges were not collected for that scope while retaining source link metrics, rather than presenting an unexplained empty graph

#### Scenario: Report views are compared
- **WHEN** an operator compares HTML, downloadable JSON, terminal completion output, and `reports list`
- **THEN** source page totals, exclusive page outcomes, resource outcomes, and warning/error counts SHALL agree

### Requirement: Provider-neutral source status selection
The system SHALL expose `--source-status all|current` for `migrate` and `doctor`, default to `all`, always retain the explicitly selected root, and apply the filter to automatically discovered pages only when the source adapter can determine the requested status.

#### Scenario: Default Yandex subtree
- **WHEN** a Yandex Wiki subtree contains accessible `actual` and `obsolete` descendants and source status is omitted or `all`
- **THEN** the system SHALL select both statuses by omitting the actuality filter

#### Scenario: Current Yandex subtree
- **WHEN** the operator selects `--source-status current` for a Yandex Wiki subtree
- **THEN** the system SHALL select `actual` descendants, retain the explicit root, and report every otherwise accessible excluded descendant as `source-status`

#### Scenario: Confluence source status
- **WHEN** a Confluence hierarchy response identifies page status
- **THEN** `current` SHALL retain only current descendants while `all` SHALL retain every accessible structural page exposed by that hierarchy API

#### Scenario: Unsupported status classification
- **WHEN** the chosen source, scope, or API cannot determine a requested non-default source status
- **THEN** preflight SHALL fail before destination mutation with provider- and scope-specific guidance

### Requirement: Complete subtree discovery integrity
The system SHALL exhaust hierarchy pagination, reconcile mutable locator drift by immutable page ID, validate every selected page detail, and freeze an exact unique rooted tree before any destination mutation.

#### Scenario: Cursor pagination exceeds one page
- **WHEN** a descendant response includes a next cursor even when the current result count is below the requested page size
- **THEN** discovery SHALL continue until no next cursor remains and SHALL include each immutable page ID exactly once

#### Scenario: Locator changes during discovery
- **WHEN** one immutable page ID is returned with another slug, locator, source status, or in-subtree parent during detail hydration
- **THEN** the final detail SHALL become authoritative, previous values SHALL remain aliases or diagnostics, and discovery SHALL continue with an inventory-drift normalization

#### Scenario: Page moves outside the subtree
- **WHEN** final hydrated ancestry proves that a discovered page no longer belongs to the requested subtree
- **THEN** it SHALL be excluded with reason `inventory-drift` and SHALL NOT abort or mutate the remaining valid tree

#### Scenario: Invalid pagination or identity contract
- **WHEN** a cursor repeats, immutable identity cannot be resolved, or provider details lack required content or hierarchy fields
- **THEN** discovery SHALL fail as an incomplete source inventory before destination mutation

#### Scenario: Invalid pagination contract
- **WHEN** a cursor repeats or provider entries cannot be reconciled to one immutable identity
- **THEN** discovery SHALL fail as an incomplete source inventory before destination mutation

#### Scenario: Detail fetch fails
- **WHEN** any selected descendant cannot be loaded or lacks required content or hierarchy fields
- **THEN** the run SHALL report that page and stop before destination mutation rather than silently omitting it

#### Scenario: Intermediate ancestor is unavailable or filtered
- **WHEN** a selected page's immediate source parent is not selected but a higher selected ancestor exists
- **THEN** the page SHALL attach to the nearest selected ancestor and the hierarchy gap SHALL be recorded

### Requirement: Destination hierarchy reconciliation
The system SHALL compare every mapped destination parent with the frozen projected source parent and repair proven mappings top-down independently of destination body revision without deleting destination data.

#### Scenario: Unchanged Confluence page has the wrong parent
- **WHEN** a proven mapped Confluence page has a different parent from the expected mapped parent
- **THEN** the system SHALL move it through the deployment-specific update API, read it back, and require the expected parent before processing descendants

#### Scenario: Mapped page was changed by a user
- **WHEN** a proven mapped page has both a wrong parent and a meaningful body or title difference
- **THEN** the system SHALL reconcile hierarchy and current source content as new verified destination revisions rather than marking a conflict

#### Scenario: Destination cannot move pages
- **WHEN** a proven mapped page has the wrong parent and the destination adapter cannot move it safely
- **THEN** the system SHALL create a source-derived replacement under the expected parent, preserve the old ID in state history, reset resource mappings, and leave the old page untouched

#### Scenario: Hierarchy repair fails
- **WHEN** move, recreation, or parent verification fails because of API, permission, network, missing parent, or irreducible identity ambiguity
- **THEN** the affected page SHALL fail or conflict as applicable and selected descendants SHALL remain causally blocked rather than being created under the wrong parent

### Requirement: Observable source selection coverage
The system SHALL reconcile discovered, selected, excluded, inventoried, and transferred page counts from one source-selection record in terminal output, state run history, HTML/JSON reports, and the report catalog.

#### Scenario: Discovery completes
- **WHEN** a source graph is frozen
- **THEN** output SHALL show the explicit root, returned descendant count, selected count, source-status exclusions, maximum depth, and inventory completeness before writes begin

#### Scenario: Source status changes between runs
- **WHEN** the same canonical endpoints are rerun with another source status
- **THEN** state identity SHALL remain stable, newly selected pages SHALL be added without duplicates, and mappings outside the current selection SHALL remain untouched and be reported as stale

#### Scenario: Hierarchy is repaired
- **WHEN** a destination page is moved or replaced to restore its expected parent
- **THEN** terminal output and report metadata SHALL identify the page, old parent or mapping, new parent or mapping, and verified outcome without exposing credentials

### Requirement: Configurable page comment transfer
The `migrate` and `doctor` commands SHALL accept `--comments` and `--no-comments`, default comments to enabled, and exclude this choice from canonical automatic state identity.

#### Scenario: Default migration
- **WHEN** the operator omits both comment flags
- **THEN** the system SHALL inventory and transfer accessible page comments

#### Scenario: Explicit disable
- **WHEN** the operator uses `--no-comments`
- **THEN** the system SHALL perform the page transfer without comment API calls and preserve existing comment state and destination objects

#### Scenario: Doctor capability probe
- **WHEN** comments are enabled during `doctor`
- **THEN** source comment readability SHALL be probed without mutation and an inability to prove destination write permission SHALL be reported as a warning rather than a failed preflight

### Requirement: Comment-aware transfer capabilities
Source and destination adapters SHALL declare comment read, create, and update capabilities independently of page and resource capabilities, and preflight SHALL require only those supported by the selected direction and operation.

#### Scenario: Append-only comment destination
- **WHEN** a destination can create but cannot update comments
- **THEN** preflight SHALL permit transfer and reruns SHALL use revision comments rather than destructive replacement

#### Scenario: Unsupported comment read
- **WHEN** the selected source cannot expose page comments and comments are enabled
- **THEN** the system SHALL identify the unavailable capability before page mutation while allowing the operator to rerun with `--no-comments`

### Requirement: Comment-aware progress and state
State and progress SHALL record comment fingerprints, mappings, history, per-page status, counts, known bytes, and last errors as optional page data while retaining current state files that predate those fields.

#### Scenario: Existing state is resumed
- **WHEN** a current state file has page mappings but no comment records
- **THEN** a comments-enabled rerun SHALL add comment state without duplicating mapped pages or requiring `--fresh`

#### Scenario: Progress is displayed
- **WHEN** comment inventory completes
- **THEN** terminal planning and progress SHALL show exact threads, entries, participants, referenced attachments, known bytes, and completed page archives

### Requirement: Reconciled comment outcome reporting
Terminal summaries, state run counters, report JSON/HTML, and the report catalog SHALL derive comment source totals and `complete`, `partial`, `failed`, `conflict`, `stale`, and `skipped` outcomes from one deduplicated record.

#### Scenario: Mixed outcomes
- **WHEN** selected pages include verified archives, an API failure, no comments, a user conflict, and comments disabled on another run
- **THEN** every selected page SHALL reconcile to exactly one comment outcome and issue counts SHALL match across all report surfaces

#### Scenario: Actual destination preview
- **WHEN** an archive comment was created or updated remotely
- **THEN** the report SHALL preview the body read back from destination rather than only the intended render

### Requirement: Non-blocking comment pipeline
Remote transfer SHALL process comments after the corresponding page body and ordinary resources, and a comment-specific failure SHALL not roll back or suppress verified page content.

#### Scenario: Archive upload fails
- **WHEN** a comment ZIP cannot be uploaded
- **THEN** the page body and ordinary resources SHALL remain transferred, comment status SHALL be failed, and overall page status SHALL be partial

#### Scenario: Destination page is recreated
- **WHEN** consistency recovery recreates a mapped destination page
- **THEN** stale comment and comment-archive mappings for the previous page SHALL be reset and rebuilt from verified cache without deleting the old destination objects

### Requirement: Authoritative create-time title collision recovery
The system SHALL treat a destination create response as authoritative for title uniqueness and SHALL recover a recognized duplicate-title rejection through bounded deterministic names without modifying or adopting unrelated content.

#### Scenario: Lookup misses a conflicting Confluence title
- **WHEN** a space-wide title lookup returns no page but Confluence rejects creation with a recognized duplicate-title `400` or `409`
- **THEN** the system SHALL retry with the stable slug suffix, then the canonical-source hash suffix, and then bounded deterministic sequence suffixes
- **AND** it SHALL verify the created page's parent and source-derived bootstrap body before processing descendants

#### Scenario: Conflict is occupied repeatedly
- **WHEN** more than one deterministic candidate is rejected as a duplicate title
- **THEN** the system SHALL try at most ten candidates in stable order and SHALL fail the source page once when every candidate is exhausted

#### Scenario: Create response is ambiguous
- **WHEN** page creation has an ambiguous outcome
- **THEN** the system SHALL search below the expected parent and adopt only a page whose source-derived bootstrap is semantically equivalent
- **AND** it SHALL NOT modify an unrelated same-title page

#### Scenario: Create fails for another bad request
- **WHEN** a destination returns `400` for a reason that is not classified as a duplicate title
- **THEN** the system SHALL preserve that error and SHALL NOT retry it with alternate titles

#### Scenario: Collision recovery succeeds
- **WHEN** a deterministic alternate title is created and verified
- **THEN** state and reports SHALL retain the actual destination title and the migration SHALL continue with the page's descendants, resources, and comments without requiring `--fresh`

### Requirement: Causal transfer outcome lifecycle
The system SHALL distinguish attempted failures, dependency-blocked work, interrupted work, and dry-run plans for every selected page, transferable resource, and enabled comment archive.

#### Scenario: Dry-run finishes
- **WHEN** a dry-run plans an object without destination mutation
- **THEN** that object's outcome SHALL be `planned`

#### Scenario: Live prerequisite fails
- **WHEN** a page cannot be created, reconciled, or verified and a descendant depends on that destination parent
- **THEN** the descendant and its resources and comment archive SHALL be `blocked`, SHALL identify the upstream page and cause, and SHALL NOT be attempted under another parent

#### Scenario: Live run is interrupted before an object starts
- **WHEN** a live run terminates before an independent object begins processing
- **THEN** the object's outcome SHALL be `not-started` rather than `planned`, `failed`, or `complete`

#### Scenario: Live run reaches a normal terminal result
- **WHEN** a non-dry-run finishes as completed, completed-with-warnings, partial, or failed
- **THEN** no page, resource, or comment outcome SHALL remain `planned`

#### Scenario: Blocked state is resumed
- **WHEN** the upstream cause is resolved on a repeated run with the same state
- **THEN** blocked pages and their objects SHALL be retried in top-down order without duplicate destination objects

### Requirement: Causal issue accounting
The system SHALL count root operation errors independently from objects blocked by those errors and SHALL expose the same causal totals in terminal output, state run metadata, report JSON/HTML, and the report catalog.

#### Scenario: One failed parent blocks a subtree
- **WHEN** one page failure prevents several descendants and resources from starting
- **THEN** the report SHALL count one root error and separate dependent page, resource, and comment block totals instead of counting every blocked object as an independent error

#### Scenario: Blocked object is inspected
- **WHEN** an operator inspects a blocked page, resource, or comment archive
- **THEN** the report SHALL identify the upstream page, stable cause code, readable reason, and action to rerun after resolving the root cause

#### Scenario: Outcome surfaces are compared
- **WHEN** terminal, state, report JSON/HTML, and `reports list` are compared
- **THEN** their source totals, exclusive outcome totals, root errors, dependent blocks, and transferred-byte totals SHALL agree

### Requirement: Contextual raw fallback diagnostics
The system SHALL describe the source construct or renderer condition that caused a raw fallback when that context can be determined without exposing source content.

#### Scenario: Preferred renderer returns an empty body
- **WHEN** normalized content is non-empty but preferred rendering produces an empty body
- **THEN** the page SHALL retain its complete raw fallback and partial status while the issue identifies the recognized construct category or renderer condition rather than only a generic failure

### Requirement: Offline interactive report dashboard
Every new HTML report SHALL provide a self-contained interactive dashboard that works from `file://` without fetching application code, styles, fonts, telemetry, or report data from a network service.

#### Scenario: Report is opened offline
- **WHEN** an operator opens a generated `index.html` without network access
- **THEN** the summary, filters, hierarchy, details, previews, localization, and themes SHALL remain usable

#### Scenario: Source or destination link is activated
- **WHEN** an operator explicitly activates a source or destination link
- **THEN** the browser MAY navigate to that external location without the report making background requests beforehand

### Requirement: Source and destination comparison summary
The report SHALL present a concise reconciled comparison of source inventory and destination outcomes for pages, files, comments, and bytes before the hierarchy.

#### Scenario: Summary is inspected
- **WHEN** an operator opens a completed, partial, failed, interrupted, or dry-run report
- **THEN** one table SHALL show non-zero source discovered, selected, excluded, known, and unknown counts beside non-zero exclusive destination outcomes and verified transferred bytes
- **AND** the table SHALL omit visible column headings while retaining screen-reader labels for the metric, source, and destination cells
- **AND** an entirely empty optional category SHALL be omitted

#### Scenario: Non-complete outcomes exist
- **WHEN** any page, file, or comment archive is not complete
- **THEN** the summary SHALL identify each outcome with text, iconography, and contrast rather than color alone

### Requirement: Unified report hierarchy
The report SHALL present selected and excluded source pages in one searchable, filterable hierarchy while keeping exclusion distinct from a destination failure.

#### Scenario: Hierarchy is first displayed
- **WHEN** the report contains page nodes
- **THEN** all known branches SHALL be expanded, preserve source placement when known, and expose controls to collapse branches

#### Scenario: Problem filter is applied
- **WHEN** an operator filters by a problem outcome or searches for an object
- **THEN** matching pages and their ancestors SHALL remain visible while unrelated branches are hidden

#### Scenario: Source-status exclusion is present
- **WHEN** an accessible page was excluded by source-status filtering
- **THEN** it SHALL appear at its known source position with an excluded outcome and reason and SHALL NOT count as a destination error

#### Scenario: Excluded placement is unknown
- **WHEN** a provider cannot expose enough metadata to place an excluded page
- **THEN** the report SHALL place it in an explicit unknown-position group with its source locator and reason

### Requirement: Object-specific report details
The report SHALL expose a keyboard-accessible per-page detail dialog with overview, files, comments, comparison, and issues views tied to typed object diagnostics.

#### Scenario: Page details are opened
- **WHEN** an operator activates a page row or its view control
- **THEN** the dialog SHALL identify source and destination references, source and destination parents, outcome, non-zero metrics, resources, comments, previews, and causal issues for that page
- **AND** definition data SHALL appear as flat labelled rows rather than nested cards

#### Scenario: Resource failure is inspected
- **WHEN** an image, attachment, or comment attachment is incomplete
- **THEN** the files view SHALL identify its source and destination names, kind, size, hash when available, outcome, affected reference, exact redacted reason, and corrective action

#### Scenario: Comment failure is inspected
- **WHEN** a comment thread, entry, archive, or ZIP has a problem
- **THEN** the comments view SHALL identify the affected non-secret comment metadata, outcome, exact redacted reason, and corrective action without placing complete comment bodies in downloadable JSON

#### Scenario: Causal issue is inspected
- **WHEN** a failed or conflicted object blocks dependent work
- **THEN** the issues view SHALL group dependent objects under the root cause and expose category, phase, retryability, occurrence count, and action
- **AND** technical diagnostics SHALL appear as flat expandable rows rather than nested cards

### Requirement: Safe localized report presentation
The report SHALL support Russian and English, system/light/dark themes, responsive layouts, and safe rendering of untrusted source-derived metadata and previews.

#### Scenario: Report language is selected
- **WHEN** no report-language preference exists
- **THEN** the interface SHALL select Russian for a Russian browser locale and English otherwise and SHALL allow a remembered manual override

#### Scenario: Report theme is selected
- **WHEN** no report-theme preference exists
- **THEN** the interface SHALL follow the operating-system theme and SHALL allow a remembered light or dark override

#### Scenario: Source-derived content is malicious or malformed
- **WHEN** titles, diagnostics, resource names, URLs, or preview bodies contain active markup or script-like content
- **THEN** interface text SHALL be escaped, unsafe URLs SHALL not become active links, and previews SHALL remain isolated in sandboxed frames

#### Scenario: Metadata is downloaded
- **WHEN** report JSON is downloaded
- **THEN** it SHALL retain typed counts, outcomes, object references, and redacted diagnostics but SHALL exclude credentials, email, full page bodies, full comment bodies, and preview HTML

### Requirement: Scalable accessible report navigation
The report SHALL remain operable with keyboard and assistive technology and SHALL bound rendered hierarchy work for large source graphs.

#### Scenario: Keyboard navigation is used
- **WHEN** an operator navigates rows, controls, tabs, tooltips, or the dialog without a pointer
- **THEN** focus order, labels, activation, focus trapping, dismissal, and tree expansion SHALL be available through standard keyboard interactions

#### Scenario: Large hierarchy is opened
- **WHEN** a report contains ten thousand page nodes
- **THEN** search, filtering, branch expansion, and detail opening SHALL remain responsive by rendering only the visible hierarchy window without changing logical totals

### Requirement: Semantic-empty source pages
The system SHALL classify page content after removing only provider-defined empty editor scaffolding and SHALL treat a page with no remaining meaningful text, media, references, structure, macros, or directives as a valid empty page.

#### Scenario: Source contains only empty heading scaffolding
- **WHEN** a source page contains whitespace and headings without titles, bodies, media, anchors, or other meaningful content
- **THEN** the destination SHALL receive its provider-safe empty body, the page SHALL be eligible for `complete`, and no raw fallback or source snapshot SHALL be required

#### Scenario: Empty page is a hierarchy container
- **WHEN** a semantically empty selected page has selected descendants
- **THEN** the page SHALL be created in the expected hierarchy and SHALL NOT block or degrade its descendants

#### Scenario: Apparently empty page contains a meaningful construct
- **WHEN** visible text is empty but the source contains an anchor, image, attachment reference, table, code, macro, navigation directive, or layout cell with meaningful content
- **THEN** the page SHALL NOT be classified as semantically empty

#### Scenario: Existing ywtc fallback is resumed
- **WHEN** a mapped page previously received an unchanged ywtc raw fallback for content now classified as semantically empty
- **THEN** a rerun SHALL replace that managed fallback with the provider-safe empty body without creating another destination page or deleting attachments

### Requirement: Provider-neutral page layout preservation
The system SHALL normalize supported page layouts into ordered sections and cells before vendor rendering and SHALL use the closest native destination layout without flattening supported columns.

#### Scenario: YFM equal columns transfer to Confluence
- **WHEN** YFM contains a balanced layout with one to three ordered block columns
- **THEN** Confluence SHALL receive a top-level `ac:layout` with matching `single`, `two_equal`, or `three_equal` sections and one `ac:layout-cell` per source block

#### Scenario: Confluence equal columns transfer to Yandex Wiki
- **WHEN** Confluence Storage Format contains a valid `single`, `two_equal`, or `three_equal` layout section
- **THEN** Yandex Wiki SHALL receive ordered `{% layout %}` and `{% block %}` constructs with the complete content of every cell

#### Scenario: Same-provider layout transfer
- **WHEN** source and destination use the same provider and the source layout is accepted by that provider
- **THEN** the native layout and cell order SHALL remain native without a degradation

#### Scenario: Layout cannot be represented exactly
- **WHEN** a source layout has unsupported nesting, more destination cells than supported, or unequal widths without a destination equivalent
- **THEN** every cell SHALL remain readable in deterministic order, the raw source SHALL remain recoverable, and the page SHALL record a precise layout degradation rather than silently flattening it

### Requirement: Symmetric safe content equivalents
The normalized pipeline SHALL use stable native or semantic equivalents in both transfer directions for supported callouts, expandable blocks, child navigation, task lists, code, anchors, links, images, and attachments.

#### Scenario: Callout and expandable block transfer
- **WHEN** source content contains a supported YFM note/cut or Confluence info, tip, warning, note, or expand macro
- **THEN** the destination SHALL receive its corresponding native note/callout or cut/expand representation with title and body preserved

#### Scenario: Child navigation transfer
- **WHEN** source content contains a supported YFM tree directive or Confluence children macro
- **THEN** the destination SHALL receive native child navigation with supported depth and ordering parameters, or a deterministic static selected-page list where native navigation is unavailable

#### Scenario: Task and code transfer
- **WHEN** source content contains task items or code with an identified language
- **THEN** the destination SHALL preserve task completion state and code text and SHALL preserve the language when its native representation supports it

#### Scenario: Provider feature has no safe equivalent
- **WHEN** a macro or interactive construct is not in the supported equivalence matrix
- **THEN** the system SHALL keep a readable non-executable representation, retain raw source, and report the specific construct as a degradation

### Requirement: Layout-aware destination verification
Provider-aware verification SHALL compare semantic emptiness plus ordered layout sections and cells in addition to meaningful text, references, blocks, tables, code, and macros.

#### Scenario: Destination preserves layout
- **WHEN** the destination reserializes namespaces, attributes, whitespace, or empty layout padding but retains the expected ordered sections, cells, and their meaningful contents
- **THEN** verification SHALL accept the layout as complete

#### Scenario: Destination flattens or drops a column
- **WHEN** a native-layout destination loses a section, changes cell order, flattens supported columns, or omits meaningful cell content
- **THEN** verification SHALL return partial for represented formatting simplification or failed for missing data and identify the layout difference

#### Scenario: Empty bodies are equivalent
- **WHEN** expected and actual bodies are both semantically empty despite provider-specific empty serialization
- **THEN** verification SHALL return complete rather than rejecting the destination for having no visible text

### Requirement: Source-authoritative mapped destination updates
The current source SHALL be authoritative for every page whose destination identity is proven by the selected state, while unmapped or ambiguously owned destination objects remain protected.

#### Scenario: Mapped destination differs
- **WHEN** a mapped destination page has a different body, title, provider version, normalized representation, or parent from the last verified run
- **THEN** the system SHALL read the latest object, apply the current source representation as a new destination version, verify it, and SHALL NOT create a duplicate

#### Scenario: Mapped destination is semantically equivalent
- **WHEN** provider-aware comparison finds the latest destination body, meaningful structure, references, and expected hierarchy equivalent to the rendered source
- **THEN** the system SHALL reuse the current object without issuing a content update and SHALL checkpoint the confirmed fingerprint and provider version

#### Scenario: Derived mapping fields are absent or stale
- **WHEN** state contains a destination immutable ID but its URL, canonical ID, title, version, or fingerprint is absent or stale
- **THEN** the system SHALL read the immutable ID and repair derived state fields rather than reporting an incomplete mapping conflict

#### Scenario: Destination revision is replaced
- **WHEN** a mapped destination revision differs and a verified update succeeds
- **THEN** the system SHALL record `destination-revision-updated` as a safe event without warning, degradation, partial, or conflict status

#### Scenario: Concurrent Confluence revision
- **WHEN** Confluence rejects an update because another revision became current
- **THEN** the system SHALL re-read the newest revision and retry at most three times with jittered backoff based on 0.5, 1, and 2 seconds

#### Scenario: Concurrent revision retries are exhausted
- **WHEN** all bounded latest-version retries fail
- **THEN** the page SHALL be failed and its selected descendants SHALL be causally blocked by the unavailable destination parent

#### Scenario: Mapped title is occupied
- **WHEN** a source-derived title for a proven mapped page is occupied by another object
- **THEN** the system SHALL use a deterministic alternate title or retain the current mapped title while still reconciling body and hierarchy without conflict

#### Scenario: Ownership is ambiguous
- **WHEN** state and provider evidence cannot prove which existing destination object belongs to the source mapping
- **THEN** the system SHALL preserve every candidate unchanged, mark conflict with evidence, and SHALL NOT adopt or overwrite an object

#### Scenario: Earlier conflict state is resumed
- **WHEN** a repeated run loads pages previously marked conflict or blocked without current ownership evidence
- **THEN** the system SHALL replan them top-down under this authoritative policy without requiring `--fresh`

### Requirement: Confirmed destination revision checkpoints
State SHALL store a mapped destination fingerprint and provider version only from a final successful provider read after creation, update, move, or semantic reuse.

#### Scenario: Mutation response differs from read-back
- **WHEN** a provider normalizes content or advances a version after accepting a mutation
- **THEN** the system SHALL checkpoint the final read-back fingerprint and version rather than the submitted body or immediate mutation response

#### Scenario: Update or read-back fails
- **WHEN** a destination mutation cannot be confirmed by a final read
- **THEN** the system SHALL NOT record its unconfirmed fingerprint or version as verified state

### Requirement: Compact unified report overview
The report SHALL place the illustration, status, time, source-to-destination comparison, ordered canonical metadata, and JSON download in one flat top-level section before the hierarchy.

#### Scenario: Overview is inspected
- **WHEN** an operator opens a generated report
- **THEN** the overview SHALL contain the illustration, status, time, non-zero page/file/comment/byte/quality comparison, and `report.json` download
- **AND** its metadata SHALL appear exactly in the order `RUN ID`, `STATE`, `SOURCE`, `DESTINATION`
- **AND** safe canonical source and destination URLs SHALL be active links while missing or unsafe values SHALL render as plain text
- **AND** Run ID SHALL appear only in that metadata block

#### Scenario: Compact report structure is checked
- **WHEN** the report application renders
- **THEN** it SHALL retain a hidden accessible H1 but SHALL NOT visibly render the report title, the provider/profile/scope/status-mode line, a progress bar, a completed-pages percentage, visible comparison-table headings, or an open-result button
- **AND** it SHALL NOT render standalone summary, root-causes, outputs, or local-report disclaimer sections

#### Scenario: Detailed diagnostics are inspected
- **WHEN** the run contains errors, blocked dependencies, degradations, or normalizations
- **THEN** the operator SHALL inspect them from highlighted hierarchy rows and the affected page's problem details without a separate root-causes panel

#### Scenario: Overview and hierarchy surfaces are checked
- **WHEN** the report application renders its main document
- **THEN** the overview and hierarchy SHALL be flat sections on the page background without card-style outer containers
- **AND** the modal SHALL remain available as the distinct interaction surface for page details

### Requirement: Accessible cycling report preferences
The report SHALL expose language and theme as icon-only buttons with visible tooltips, accessible names, deterministic cycling, and remembered preferences.

#### Scenario: Theme control is activated
- **WHEN** the operator activates the theme button
- **THEN** it SHALL cycle `system → light → dark → system`, update Monitor/Sun/Moon iconography, announce current and next modes, and persist the selection when storage is available

#### Scenario: Language control is activated
- **WHEN** the operator activates the language button
- **THEN** it SHALL alternate Russian and English using stable embedded flag SVGs, announce current and next languages, and persist the selection when storage is available

#### Scenario: Preference storage is unavailable
- **WHEN** local storage is inaccessible
- **THEN** both controls SHALL remain keyboard-operable and update the current report session without failing the application

### Requirement: Typed collision and ownership outcomes
The system SHALL classify destination races and collisions by typed operation evidence and SHALL reserve `conflict` exclusively for ambiguous immutable ownership or identity.

#### Scenario: Diagnostic contains conflict wording
- **WHEN** a provider or library diagnostic contains `conflict`, `duplicate`, `title`, or HTTP `409` without ownership evidence
- **THEN** the system SHALL classify the actual operation outcome and SHALL NOT infer `conflict` from message text

#### Scenario: Ownership is provably ambiguous
- **WHEN** multiple source mappings claim one destination page ID, a provider returns another immutable ID, or several candidates remain equally valid
- **THEN** the affected page SHALL be `conflict`, every candidate SHALL remain unchanged, and state plus reports SHALL record the reason and candidate IDs

#### Scenario: Revision race is exhausted
- **WHEN** a mapped update still loses a provider revision race after bounded latest-version retries
- **THEN** the page SHALL be `failed` rather than `conflict` and dependent descendants SHALL be causally blocked

### Requirement: Information-impact transformation notices
Every normalized or rendered transformation SHALL carry a typed `normalization`, `adaptation`, or `degradation` notice according to verified information impact.

#### Scenario: Representation changes without information loss
- **WHEN** destination representation changes layout, interaction, or presentation while retaining all source data and meaningful references
- **THEN** the page SHALL remain `complete` and the transformation SHALL be reported as an adaptation without warning or degradation

#### Scenario: Information is absent or unverified
- **WHEN** source data, a managed resource, a comment, a significant structure, or its destination verification is missing
- **THEN** the affected object SHALL be partial or failed and SHALL carry a degradation or error describing the missing information

#### Scenario: Run contains only adaptations and normalizations
- **WHEN** every selected object is verified complete and notices contain only adaptations or safe normalizations
- **THEN** the run SHALL be `completed` rather than `completed-with-warnings`

### Requirement: Preserved external references
The system SHALL preserve source-external HTTP(S) references as external references without treating their continued external nature as an incomplete transfer.

#### Scenario: External image is preserved
- **WHEN** a source page embeds an image outside the source provider's managed resources
- **THEN** the destination SHALL retain its absolute URL and available alt and dimension metadata, verification SHALL require that representation, and the page MAY remain complete

#### Scenario: Managed image upload fails
- **WHEN** a source-managed image cannot be copied and remains linked to its source download URL
- **THEN** the resource and page SHALL remain partial because a requested managed resource was not transferred

### Requirement: Serialized live state mutation
A live transfer SHALL hold one exclusive lease for its selected state while destination mutations and checkpoints are possible.

#### Scenario: Another live run owns the state
- **WHEN** a second process selects a state with a current provably active lease
- **THEN** it SHALL stop before destination mutation and identify the active non-secret run information

#### Scenario: Local lease is stale
- **WHEN** lease metadata proves that its owning local process no longer exists
- **THEN** the next live run SHALL recover the lease and continue without changing destination identity

#### Scenario: Dry-run overlaps a live run
- **WHEN** a dry-run reads state while a live run owns its lease
- **THEN** it SHALL use an atomic state snapshot without acquiring a write lease or mutating state

### Requirement: Guided interactive migration
The CLI SHALL provide `ywtc migrate --interactive` and `ywtc migrate -i` as a TTY-only state-machine wizard that produces the same validated migration request as non-interactive invocation while retaining edited draft values across navigation.

#### Scenario: Guided default flow
- **WHEN** the operator starts interactive migration without endpoint options
- **THEN** the wizard SHALL default to Yandex Wiki source, Confluence destination, `subtree` scope, source status `all`, comments enabled, archive disabled, automatic state, and configured concurrency

#### Scenario: Command values prefill the wizard
- **WHEN** interactive migration receives any supported migration options
- **THEN** those values SHALL become editable initial answers and SHALL retain their existing semantics unless the operator changes them

#### Scenario: Required interactive stages
- **WHEN** the operator proceeds through the wizard
- **THEN** it SHALL require workdir, compatible source provider/profile/locator, compatible remote destination provider/profile/locator or Markdown/HTML output directory, scope, comment choice, and a final action

#### Scenario: Conditional archive stage
- **WHEN** the selected destination is Markdown or HTML
- **THEN** the wizard SHALL offer an archive choice defaulting to disabled
- **AND** changing destination to a remote provider SHALL clear any prior archive choice

#### Scenario: Missing workspace
- **WHEN** the selected workdir has no usable configuration
- **THEN** the wizard SHALL offer interactive initialization as the default action, another path, or exit, and SHALL return to migration setup after successful initialization

#### Scenario: Backward navigation
- **WHEN** the operator goes backward and then forward between completed stages
- **THEN** validated answers SHALL remain in memory and required values SHALL remain editable without exposing credentials

#### Scenario: Non-interactive terminal
- **WHEN** `migrate --interactive` runs without interactive input and output terminals
- **THEN** it SHALL exit with usage code `2` before filesystem or API mutation and SHALL explain how to use non-interactive migration

#### Scenario: Wizard cancellation
- **WHEN** the operator cancels or sends SIGINT before an operation begins
- **THEN** the wizard SHALL make no migration mutation and return code `130`

### Requirement: Interactive dry-run and live handoff
The wizard SHALL execute dry-run and live actions through the ordinary migration runner, SHALL require an explicit live choice, and SHALL preserve state identity, reports, output, signal handling, and exit-code semantics across sequential actions in one process.

#### Scenario: Default final action
- **WHEN** setup reaches its final action menu
- **THEN** `Сначала dry-run` SHALL be selected by default ahead of live execution, editing, and exit

#### Scenario: Dry-run completes without blockers
- **WHEN** dry-run inventory is complete and has no root error, failed page, blocked page, or ownership conflict
- **THEN** the next-action menu SHALL offer report opening, live execution with the same effective request, editing, repeating dry-run, and exit

#### Scenario: Dry-run finds a blocking outcome
- **WHEN** dry-run inventory is incomplete or contains a root error, failed page, blocked page, or ownership conflict
- **THEN** live execution SHALL not be offered while report opening, editing, repeating dry-run, and exit remain available

#### Scenario: Non-blocking quality findings
- **WHEN** dry-run contains only warnings, adaptations, safe normalizations, or verified degradations without a blocking outcome
- **THEN** the wizard SHALL permit an explicit live choice

#### Scenario: Dry-run mutation boundary
- **WHEN** the operator selects dry-run from any wizard menu
- **THEN** the run SHALL perform no remote or filesystem-destination mutation and SHALL produce its ordinary state selection and report output

#### Scenario: Exit after an operation
- **WHEN** the operator exits after dry-run or live execution
- **THEN** the wizard SHALL return the exit code of the latest completed operation; SIGINT and SIGTERM SHALL retain codes `130` and `143`

### Requirement: Stable public CLI aliases
The CLI SHALL retain every existing long option and SHALL expose only the documented unique short aliases without changing command-specific validation or defaults.

#### Scenario: Migration aliases are parsed
- **WHEN** migration receives `-i`, `-w`, `-s`, `-d`, `-S`, `-D`, `-m`, `-t`, `-C`, `-N`, `-f`, `-a`, `-n`, `-F`, `-o`, `-j`, or `-r`
- **THEN** each alias SHALL have exactly the same value and validation as its corresponding long option

#### Scenario: Update aliases are parsed
- **WHEN** update receives `-i` or `-c`
- **THEN** they SHALL behave exactly as command-scoped `--install` and `--via`

#### Scenario: Command-scoped aliases coexist
- **WHEN** the same short alias exists on distinct subcommands, including `-i` and `-w`
- **THEN** Commander SHALL resolve it only within the active command without colliding with global help or version aliases

#### Scenario: Non-interactive endpoint requirement
- **WHEN** `migrate` runs without interactive mode and either source or destination is absent
- **THEN** it SHALL exit with usage code `2` before workspace, filesystem, or API mutation

### Requirement: Runtime-validated Confluence provider responses
The Confluence Data Center and Cloud clients SHALL validate every response structure before reading required fields, accept unknown additive fields, and convert invalid successful HTTP responses into typed redacted provider diagnostics rather than JavaScript runtime errors.

#### Scenario: Confluence returns a startup page with HTTP 200
- **WHEN** a Confluence REST route returns HTML describing startup, maintenance, or another provider error with a successful HTTP status
- **THEN** preflight SHALL report that Confluence is unavailable or not fully started, include a concise safe provider reason when detectable, and recommend retrying after service recovery
- **AND** output SHALL NOT contain raw HTML, credentials, `Cannot read properties`, or another implementation exception

#### Scenario: Confluence page response lacks required identity
- **WHEN** a page response lacks a non-empty immutable ID, title, or space identity required by the selected deployment
- **THEN** the operation SHALL fail with the provider, operation, and missing response paths plus URL/deployment/health guidance
- **AND** no caller SHALL dereference the missing structure

#### Scenario: Confluence list response is malformed
- **WHEN** a page, space, attachment, descendant, comment, or user-list response lacks the required result collection or required item identity
- **THEN** the operation SHALL fail as an invalid Confluence API response before pagination, mapping, or mutation logic consumes it

#### Scenario: Confluence response adds optional fields
- **WHEN** a valid supported response includes unknown optional fields
- **THEN** validation SHALL preserve compatibility by accepting the response and using only the required normalized fields

#### Scenario: Confluence returns an HTML server error
- **WHEN** a Confluence endpoint returns HTML with `5xx` after bounded retries
- **THEN** the HTTP diagnostic SHALL identify provider/server unavailability and expose a concise text summary rather than raw markup

### Requirement: Preflight barrier before endpoint resolution
Migration and doctor SHALL complete required source and destination platform preflight successfully before resolving either page locator, creating or loading state, generating a run report, or performing destination mutations.

#### Scenario: Destination platform preflight fails
- **WHEN** destination preflight detects startup HTML, invalid provider structure, authentication failure, timeout, DNS failure, TLS failure, rate limiting, or exhausted server errors
- **THEN** source and destination page locator requests SHALL NOT begin
- **AND** the command SHALL exit non-zero with the typed redacted provider diagnosis and without destination mutation

#### Scenario: Both platform preflights succeed
- **WHEN** source and destination platform contracts are established
- **THEN** the command MAY resolve source and destination locators in parallel and continue the ordinary discovery pipeline

#### Scenario: Connection wizard encounters startup HTML
- **WHEN** interactive initialization probes a Confluence profile that returns a startup/error page with HTTP 200
- **THEN** the wizard SHALL classify the failure as provider/server unavailability, preserve the in-memory draft, and offer retry or editing without persisting it

### Requirement: Durable created-page identity
The system SHALL persist a confirmed destination page identity immediately after successful creation and read-back, even when later semantic verification or refinement fails.

#### Scenario: Provider normalization rejects strict verification
- **WHEN** a newly created page can be read by its immutable destination ID but its provider-normalized body does not yet pass semantic verification
- **THEN** state SHALL retain that page ID, parent, title, URL, provider version, and an unverified status before the page is reported partial or failed

#### Scenario: Run stops after creation
- **WHEN** a process ends after destination creation but before final content confirmation
- **THEN** a rerun SHALL update or verify the confirmed mapping rather than create another destination page

#### Scenario: Earlier run omitted the checkpoint
- **WHEN** state lacks a mapping but exactly one page below the expected parent has the deterministic title and semantically compatible source-derived body
- **THEN** the system SHALL adopt and verify that candidate without modifying an unrelated page or creating a duplicate

### Requirement: Invocation-local transformation diagnostics
Every source transformation SHALL report only diagnostics emitted while processing that source document.

#### Scenario: Earlier page has unresolved variables
- **WHEN** one page emits unresolved-variable diagnostics and the next page transforms without that condition
- **THEN** the next page SHALL receive none of the earlier page's diagnostics, degradations, or partial status

#### Scenario: Diagnostics are reported repeatedly
- **WHEN** a page emits several diagnostics of the same stable type
- **THEN** reports SHALL retain the affected details while issue identity remains based on a stable code rather than the full message text

### Requirement: Resumable streamed resource download
The system SHALL retry the complete streamed download operation through isolated temporary files and SHALL publish cache files only after stream completion and hash verification.

#### Scenario: Response stream aborts after headers
- **WHEN** a resource response starts successfully but terminates with a retriable stream error before completion
- **THEN** the partial temporary file SHALL not become the cache entry and the complete download SHALL be retried within bounded network policy

#### Scenario: Retry succeeds
- **WHEN** a later streamed attempt completes
- **THEN** state and reports SHALL use the actual byte count and SHA-256 of the completed file and SHALL count the resource once

#### Scenario: Source size metadata is ambiguous
- **WHEN** a provider returns a unitless non-integer size string whose unit cannot be proven
- **THEN** source size SHALL remain unknown until actual bytes are downloaded or verified rather than being interpreted as bytes

### Requirement: Meaning-preserving provider verification
Destination verification SHALL compare canonical meaningful payloads and SHALL accept provider-only serialization differences without accepting omitted information.

#### Scenario: Provider removes empty scaffolding
- **WHEN** destination normalization removes empty list items, empty table rows, empty headings, service anchors, wrappers, or legacy formatting tokens while retaining every meaningful payload
- **THEN** verification SHALL accept the destination as complete and MAY record a normalization

#### Scenario: Provider regenerates local anchors
- **WHEN** same-page generated anchor identifiers differ but every linked heading target remains represented and resolvable
- **THEN** verification SHALL accept the anchor mapping without requiring byte-identical IDs

#### Scenario: Meaningful reference is lost
- **WHEN** destination content omits a non-empty text block, table cell, code block, external or page link, image, attachment reference, or meaningful anchor target
- **THEN** verification SHALL remain incomplete and identify the missing payload

### Requirement: Accessible attachment-image representation
Meaningful source alternative text for a managed image SHALL remain present in the verified destination even when its provider removes the native image-alt attribute.

#### Scenario: Confluence drops attachment image alt
- **WHEN** Confluence preserves the attachment image but strips its native alternative-text attribute during read-back
- **THEN** ywtc SHALL preserve meaningful alternative text in a safe readable adjacent representation, verify it, and record an adaptation without making the page partial

#### Scenario: Alternative text is not meaningful
- **WHEN** source alternative text is empty or equivalent to the attachment filename
- **THEN** the image SHALL not receive redundant fallback text and SHALL remain complete when its resource and dimensions verify

### Requirement: Confirmed mapped-update rejection recovery
A rejected final update of a confirmed mapped page SHALL be retried only after the page identity and current destination state are re-read.

#### Scenario: Confirmed page update is transiently forbidden
- **WHEN** a mapped page update returns `403` but the page remains readable by the same immutable ID
- **THEN** the system SHALL refresh the page and perform one bounded retry without classifying the response as proven permanent permission denial

#### Scenario: Confirmed page update remains forbidden
- **WHEN** the refreshed retry is also rejected
- **THEN** the verified bootstrap body SHALL remain available, the page SHALL be partial or failed according to actual body verification, and the issue SHALL identify a provider update rejection with corrective guidance

### Requirement: Provider-null Yandex Grid content
The system SHALL accept an explicit null inline body for a valid Yandex Wiki Grid page, distinguish it from a semantically empty ordinary page, and account for the Grid payload independently without aborting subtree discovery.

#### Scenario: Grid data is available through the resource API
- **WHEN** Yandex Wiki returns a valid Grid page with `content: null` and exposes its Grid rows and columns through the Grid API
- **THEN** the page SHALL continue through discovery and transfer, the complete Grid SHALL be rendered as the supported static-table adaptation, and null inline content SHALL NOT make the page partial or failed

#### Scenario: Grid data is temporarily unavailable through the provider API
- **WHEN** Yandex Wiki returns a valid Grid page with `content: null`, exposes stable Grid identity, but the Grid payload read exhausts retryable provider errors
- **THEN** the destination SHALL receive a readable explanation and absolute source link, only that page SHALL be partial with a retryable Grid-resource issue, and the remaining selected tree SHALL continue

#### Scenario: Grid data is permanently unavailable through the provider API
- **WHEN** Yandex Wiki returns a valid Grid page with `content: null` but exposes no recoverable Grid payload or retryable evidence
- **THEN** the destination SHALL receive a readable explanation and absolute link to the source page, only that page SHALL be partial with a provider-content degradation, and the remaining selected tree SHALL continue

#### Scenario: Grid data is unavailable through the provider API
- **WHEN** Yandex Wiki returns a valid Grid page with `content: null` but exposes no recoverable Grid payload
- **THEN** the destination SHALL receive a readable explanation and absolute link to the source page, only that page SHALL be partial with a provider-content degradation, and the remaining selected tree SHALL continue

#### Scenario: Ordinary page has no inline content field
- **WHEN** a non-Grid page response omits or invalidates content required to represent that page
- **THEN** the response SHALL remain an invalid provider contract and SHALL NOT be silently classified as an empty page

#### Scenario: Ordinary page is semantically empty
- **WHEN** a valid ordinary page has an explicit string body that contains no meaningful content
- **THEN** existing semantic-empty handling SHALL apply and the page MAY remain complete without a fallback

### Requirement: Truthful incomplete discovery evidence
When selected page details cannot be hydrated, the system SHALL stop before destination mutation while preserving the known source inventory and one structured diagnostic outcome for every affected page.

#### Scenario: Some selected detail requests fail
- **WHEN** hierarchy enumeration returns selected page identities but one or more genuine detail requests fail
- **THEN** the report SHALL retain the root and every selected identity, returned and selected counts SHALL reflect the enumeration, failed identities SHALL be failed, and successfully hydrated identities SHALL be not-started

#### Scenario: Discovery failure diagnostics are emitted
- **WHEN** more than one selected detail request fails
- **THEN** the report SHALL contain deduplicated per-page issues with stable codes, object identity, redacted reason, and accurate retryability while the terminal error SHALL summarize the count without concatenating every failure

#### Scenario: Discovery barrier protects destination
- **WHEN** selected page identity, hierarchy, or required ordinary content remains unresolved after bounded provider retries
- **THEN** no destination page, resource, comment, or filesystem export SHALL be created or updated

#### Scenario: Comment inventory never started
- **WHEN** migration stops during page discovery before comment inventory
- **THEN** comments SHALL be reported as not-started rather than blocked or successfully empty

### Requirement: Serialization-independent semantic text
Destination verification SHALL derive text with explicit separators at meaningful block boundaries while preserving exact inline text adjacency, so provider serialization whitespace cannot change the outcome.

#### Scenario: Provider removes whitespace between blocks
- **WHEN** a destination returns adjacent paragraphs, captions, headings, list items, table cells, or layout cells without the whitespace present in the submitted serialization
- **THEN** verification SHALL treat the texts as equivalent when their ordered block payloads and all other meaningful structures match

#### Scenario: Inline text spacing changes
- **WHEN** a destination adds or removes meaningful whitespace between inline text fragments
- **THEN** verification SHALL identify the text difference and SHALL NOT hide it through block-boundary normalization

#### Scenario: Meaningful block is absent
- **WHEN** a destination omits or changes a non-empty block payload
- **THEN** verification SHALL remain incomplete even if the remaining flattened text could be made similar by whitespace normalization

### Requirement: Latest-representation failure recovery
After destination creation, recovery from a later pipeline error SHALL verify the actual page against the latest complete body representation ywtc attempted for that page, or against bootstrap content only when no final representation was produced.

#### Scenario: Optional operation fails after final body rendering
- **WHEN** the final source-derived body was rendered or written but a later resource, comment, update, or verification operation fails
- **THEN** recovery SHALL compare the re-read destination body with that final representation and SHALL preserve a readable verified page as partial rather than incorrectly failing it against bootstrap references

#### Scenario: Final rendering never completes
- **WHEN** processing fails before a final body representation is available
- **THEN** recovery SHALL compare the re-read destination body with the source-derived bootstrap representation

### Requirement: Correlated run identity
Each migration attempt SHALL use one run identifier for its state history, HTML report, JSON report, report directory, terminal summary, and report-opening command.

#### Scenario: Run report is written
- **WHEN** a dry-run or live migration creates a state run and a report bundle
- **THEN** every emitted run identifier and report bundle directory SHALL equal the state run identifier

### Requirement: Typed verification diagnostics
A failed semantic destination comparison SHALL be reported as a verification issue rather than a generic provider API issue.

#### Scenario: Destination content fails semantic comparison
- **WHEN** provider access succeeds but the re-read body does not preserve the expected meaningful content
- **THEN** the issue SHALL have a stable verification code, verification phase and category, affected page identity, and retry guidance

### Requirement: Resumable preflight barrier for large sources
Migration SHALL require complete selected topology, immutable page identity, ordinary page content, and resource enumeration before mutation, while checkpointing independent enrichment outcomes so recoverable resource payload failures do not block unrelated branches.

#### Scenario: Late transient structural source failure
- **WHEN** required hierarchy, page identity, ordinary page content, or resource enumeration fails after other selected pages have completed inventory
- **THEN** destination mutation SHALL remain zero, completed source checkpoints SHALL remain reusable, and the retryable page SHALL be identified independently

#### Scenario: Late transient source failure
- **WHEN** one required source operation fails after other selected pages have completed inventory
- **THEN** destination mutation SHALL remain zero, completed source checkpoints SHALL remain reusable, and the retryable page SHALL be identified independently

#### Scenario: Late transient enrichment failure
- **WHEN** one enumerated Grid payload fails after other selected pages and resource payloads have completed inventory
- **THEN** the Grid SHALL retain a retryable failed outcome, the owning page SHALL use a readable fallback, and safe unrelated destination mutations SHALL continue

#### Scenario: Same migration is repeated
- **WHEN** the operator repeats a compatible migration after incomplete inventory or retryable enrichment outcomes
- **THEN** ywtc SHALL reconcile current immutable IDs, reuse compatible page and resource checkpoints, and retry only missing, changed, or failed work

#### Scenario: Required inventory becomes available
- **WHEN** every selected page has valid topology, ordinary content, resource enumeration, and an explicit outcome for every independent enrichment
- **THEN** the destination pipeline SHALL begin with the same graph, content, state, and verification guarantees as a single uninterrupted run

#### Scenario: Full inventory becomes available
- **WHEN** every selected page and required resource collection has a valid current snapshot outcome
- **THEN** the ordinary destination pipeline SHALL begin with the same graph, content, resource, comment, state, and verification guarantees as a single uninterrupted run

#### Scenario: Required preflight cannot be completed
- **WHEN** structural or required-content recovery remains exhausted
- **THEN** terminal and report output SHALL state exact failed operations, inspected and remaining counts, retryability, checkpoint reuse, destination mutation count zero, and the canonical `ywtc retry <run-id>` action

#### Scenario: Preflight cannot be completed
- **WHEN** required recovery remains exhausted
- **THEN** the terminal summary and report SHALL state the exact failed operations, inspected and remaining counts, retryability, checkpoint reuse, and a safe continuation action without presenting unmeasured objects as empty

#### Scenario: Only retryable enrichments remain
- **WHEN** required preflight is complete but one or more independent enrichments remain retryable
- **THEN** terminal and report output SHALL distinguish topology, page bodies, resource enumeration, resource payload outcomes, and affected partial pages without calling the full inventory incomplete

### Requirement: Credential-free effective request evidence
Each migration report SHALL retain enough redacted effective-request metadata to reproduce its canonical transfer locally without storing credentials or changing automatic state identity.

#### Scenario: New report is used for retry
- **WHEN** a live migration writes its report
- **THEN** the report SHALL retain source and destination locators and profiles, scope, source status, comments, filesystem format, archive policy, and state selection needed by `ywtc retry`

#### Scenario: Existing current report lacks the request block
- **WHEN** an otherwise valid current report predates explicit effective-request metadata
- **THEN** retry SHALL reconstruct only provable inputs from canonical report fields and outputs and SHALL reject the operation before provider calls if any required input cannot be proven

### Requirement: Retry-aware state run history
State run history SHALL distinguish ordinary migrations from retry attempts and correlate every live retry with one root and parent Run ID without changing canonical transfer identity.

#### Scenario: Live retry begins
- **WHEN** an actionable retry acquires the selected state
- **THEN** its state run SHALL record operation, root run, parent run, attempt number, and selected object counts before destination mutation

#### Scenario: Existing state is loaded
- **WHEN** current state has run records without retry metadata
- **THEN** those records SHALL remain valid ordinary migration runs and SHALL require no state conversion or new state ID

### Requirement: Aggregate per-object retry provenance
Retry reports SHALL preserve the latest known result of every baseline page, resource, and comment archive and SHALL identify whether each result was attempted in the current run or carried forward.

#### Scenario: Successful object is outside retry selection
- **WHEN** a baseline object is complete and not a retry dependency
- **THEN** its outcome SHALL remain in the retry report without a provider write and SHALL identify the Run ID that supplied that outcome

#### Scenario: Selected object is retried
- **WHEN** a selected object receives a new terminal outcome
- **THEN** the aggregate report SHALL replace its earlier outcome and unresolved issues with the fresh result while retaining the rest of the baseline migration

#### Scenario: Retry surfaces are compared
- **WHEN** terminal, state, report JSON/HTML, and `reports list` describe a retry
- **THEN** full migration totals and retry-attempt totals SHALL reconcile without counting carried-forward objects as freshly attempted

### Requirement: Isolated source enrichment failures
The migration SHALL continue independently transferable branches when an enumerated resource enrichment is unavailable, while preserving a readable source fallback and a truthful retryable outcome for only the affected resource and page.

#### Scenario: Embedded Grid payload returns exhausted server errors
- **WHEN** page identity, hierarchy, ordinary body, and Grid summary are available but the Grid payload returns exhausted `429`, `5xx`, timeout, or retryable network errors
- **THEN** unrelated pages SHALL continue, the owning page SHALL contain its full ordinary content plus a Grid source fallback, and the page SHALL remain partial with a retryable Grid-resource issue

#### Scenario: Grid payload later becomes available
- **WHEN** a subsequent migration or targeted retry reads the previously unavailable Grid payload
- **THEN** the fallback SHALL be replaced by the supported static-table adaptation, the owning page SHALL be reverified, and the resolved Grid issue SHALL disappear

#### Scenario: Fallback cannot preserve resource identity
- **WHEN** the provider does not expose a stable resource identity or safe source location for the unavailable enrichment
- **THEN** the operation SHALL remain a required inventory failure and SHALL NOT be silently converted into a complete or partial page

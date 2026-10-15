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
A remote page SHALL be complete or partial only after provider-aware verification re-reads its destination body and confirms all meaningful source data is represented natively, by a recorded fallback, or by a raw snapshot.

#### Scenario: Destination returns incomplete content
- **WHEN** the re-read body is empty, a transfer placeholder, missing meaningful text or structure, or contains unaccounted source data
- **THEN** the page SHALL be failed and the run SHALL exit non-zero with the affected page and report location

#### Scenario: Body succeeds with resource fallback
- **WHEN** the re-read body contains the represented source content but one or more resources use recorded fallbacks
- **THEN** the page SHALL be partial rather than failed or complete

#### Scenario: Destination applies safe normalization
- **WHEN** the destination changes whitespace, entities, namespace or attribute ordering, removes empty nodes or service anchor spans, or adds allowed provider attributes
- **THEN** verification SHALL accept the body as complete when its meaningful text, blocks, references, tables, code, and macros remain equivalent

#### Scenario: Destination applies meaningful simplification
- **WHEN** all data remains represented but the destination changes meaningful formatting through a documented fallback
- **THEN** verification SHALL return partial and identify the degradation

#### Scenario: Destination preview is reported
- **WHEN** a page body has been verified or rejected
- **THEN** its report comparison SHALL use the body actually read from the destination rather than the body submitted by ywtc

### Requirement: Generated placeholder recovery
The system SHALL repair mapped pages whose current body exactly matches the ywtc-generated transfer placeholder for that source while preserving ordinary conflict protection.

#### Scenario: Unchanged generated placeholder is resumed
- **WHEN** a mapped destination page still contains the exact generated placeholder and retains its expected mapped title
- **THEN** a rerun SHALL replace it with source-derived content without creating a duplicate page

#### Scenario: Destination was edited manually
- **WHEN** the destination title or body differs from both the stored fingerprint and the exact generated placeholder
- **THEN** the system SHALL report a conflict and SHALL NOT overwrite the page

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
The system SHALL identify source resources independently of display filenames, resolve exact source aliases before ambiguous basenames, reserve destination names case-insensitively, and reconcile destination resources by immutable mapping or verified content before upload.

#### Scenario: Provider returns duplicate API names
- **WHEN** multiple source resources have the same API name but distinct download URLs or immutable IDs
- **THEN** each resource SHALL receive a deterministic unique destination name and every source reference SHALL resolve to its corresponding resource

#### Scenario: Destination filename is already occupied
- **WHEN** the preferred destination filename belongs to an unrelated resource
- **THEN** the system SHALL preserve that resource and choose a deterministic suffixed name for the source resource

#### Scenario: Upload result is ambiguous
- **WHEN** an upload response is lost or the destination reports an existing same-name attachment
- **THEN** the system SHALL stream and compare size plus SHA-256 where the adapter permits, adopt only an exact match, and otherwise choose the next deterministic name

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
The system SHALL distinguish safe provider normalizations from meaningful formatting degradations and data loss.

#### Scenario: Empty source heading is removed
- **WHEN** source conversion produces a heading with no title or meaningful content
- **THEN** the system SHALL remove only that heading, preserve neighboring anchors, strip terminal control codes from its diagnostic, and record a safe normalization without making the page partial

#### Scenario: Formatting structure is simplified without losing data
- **WHEN** the destination flattens a non-empty heading or list but retains its complete ordered text and references
- **THEN** verification SHALL report a meaningful degradation and the page SHALL be partial

#### Scenario: Meaningful data is lost
- **WHEN** the destination omits text, a table cell, code block, link, image, attachment reference, anchor, or meaningful macro
- **THEN** verification SHALL report data loss and the page SHALL fail

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
The system SHALL derive terminal summaries, state run counters, report metadata, HTML presentation, and report catalog counts from one deduplicated issue collection.

#### Scenario: Operation is retried
- **WHEN** one resource or page operation emits the same issue during retries or fallback handling
- **THEN** the report SHALL count the issue once per code and affected object while retaining retryability and final outcome

#### Scenario: Report counters are inspected
- **WHEN** an operator compares terminal output, state, JSON/HTML report, and `reports list`
- **THEN** warning and error counts SHALL agree, warning counts SHALL exclude separately counted degradations and safe normalizations, and all views SHALL distinguish those categories plus retryable failures

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

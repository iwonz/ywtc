# Spec Delta

## MODIFIED Requirements

### Requirement: Normalized loss-aware content pipeline
The system SHALL normalize source content into typed structural, page-reference, resource, and vendor-extension nodes and SHALL render each node natively, as a readable fallback, or with a retained raw source snapshot.

#### Scenario: Cross-provider degradation
- **WHEN** a source construct has no destination equivalent
- **THEN** the destination SHALL contain a readable fallback, the raw source SHALL be recoverable, and the report SHALL identify the degradation

#### Scenario: Unaccounted source data
- **WHEN** content or a resource is neither represented nor recoverably snapshotted
- **THEN** the page SHALL NOT be marked complete, its incomplete representation SHALL be reported explicitly, and the run and command exit SHALL follow current issue severity and retry completion rules

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
- **THEN** the system SHALL stop scheduling, flush atomic state/report data, mark the active run cancelled, and return the conventional signal exit code; a running state record found on a later open SHALL become interrupted without rewriting its old report

### Requirement: Resource-independent page completion
The system SHALL process each resource independently and SHALL persist and verify the page body even when individual resource transfers fail.

#### Scenario: Attachment transfer fails
- **WHEN** downloading, uploading, or verifying one attachment or image fails
- **THEN** other resources and the page body SHALL continue, the failed reference SHALL use its source URL or a readable fallback, and the verified page SHALL be partial with a typed resource outcome and retryability derived from the operation evidence, rather than assuming every resource failure is transient

#### Scenario: Final refinement fails
- **WHEN** a final body update or optional raw-snapshot upload fails after a source-derived bootstrap body was created
- **THEN** the bootstrap content SHALL remain intact and the page SHALL be partial unless its actual body cannot be verified

### Requirement: Complete Grid outcome reconciliation
Every discovered Grid resource SHALL have exactly one source-snapshot outcome reconciled across terminal, state, report, and retry totals; destination table preservation SHALL be verified through the owning page rather than inferred from the snapshot status.

#### Scenario: Grid data is unavailable
- **WHEN** a Grid is discovered but its payload cannot be read
- **THEN** it SHALL be reported as failed, blocked, or not-started according to its phase and dependency with an actionable source fallback rather than disappearing from the outcome sum

#### Scenario: Grid snapshot is complete
- **WHEN** all required Grid rows, columns, cells, links, and representable values are available in its source snapshot
- **THEN** the Grid snapshot SHALL be complete; only a verified complete destination table SHALL qualify its static representation as adaptation without degradation

### Requirement: Reliability and auditability
The system SHALL apply bounded retries, stream large resources, atomically checkpoint every successful mutation, verify destination objects, and produce provider-neutral HTML and JSON reports.

#### Scenario: Partial failure
- **WHEN** one page, resource, render, or verification step fails
- **THEN** independent work MAY continue, object completeness SHALL reflect actual verification, and the run status and exit code SHALL follow current unresolved issues with actionable continuation guidance

#### Scenario: Transient API error
- **WHEN** an API returns 429, 5xx, Retry-After, or a retriable network error
- **THEN** the system SHALL retry within configured bounds and respect the service cooldown before safe retries continue

### Requirement: Deployment-specific Confluence compatibility
The system SHALL support Confluence Data Center 7.9 or newer through `/rest/api` with Bearer PAT and Confluence Cloud through REST v2 page/space APIs plus REST v1 multipart attachments with Basic email/API-token authentication.

#### Scenario: Supported Data Center
- **WHEN** a connection selects `deployment: data-center` and `authType: pat`
- **THEN** preflight SHALL attempt to obtain server information, reject an identified version below 7.9, and verify the REST/storage capabilities used by migration without imposing an upper version boundary; when server information is not exposed to the user, successful required capability probes SHALL permit the run with an unknown version

#### Scenario: Supported Cloud
- **WHEN** a connection selects `deployment: cloud`, `authType: api-token`, and a direct email
- **THEN** the Cloud adapter SHALL use Basic authentication, REST v2 for pages/spaces, REST v1 for attachments, and normalize responses for the common migration pipeline

#### Scenario: Unsupported Confluence profile
- **WHEN** configuration selects Confluence Server, Data Center Basic Auth, Cloud PAT, or another unsupported pair
- **THEN** validation SHALL fail before API requests with distinct deployment, version, authentication, target URL, or missing-capability diagnostics as applicable

#### Scenario: Capability drift
- **WHEN** the configured server responds but a required page, space, storage, update, or attachment contract is unavailable
- **THEN** preflight SHALL stop before destination mutations with the failed capability and compatibility guidance

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
- **THEN** the system SHALL record safe serialization differences as normalizations, reconcile meaningful changes using the source-authoritative mapped update policy, and reserve conflict for proven ambiguous immutable ownership or identity

#### Scenario: Raw source snapshot already exists
- **WHEN** a page requires a raw fallback snapshot and the destination page already contains the deterministic snapshot filename while state lacks a usable attachment mapping
- **THEN** the system SHALL verify and adopt or safely update that attachment instead of attempting a duplicate create, and SHALL report a transfer error if reconciliation cannot prove or write the snapshot

#### Scenario: Parent or recreation cannot be confirmed
- **WHEN** the expected parent is unavailable or the recreated page cannot be read back
- **THEN** the page SHALL be blocked or failed, no destination object SHALL be deleted, and no unrelated page SHALL be adopted

#### Scenario: New locator is missing
- **WHEN** a source or destination locator that has never been confirmed returns `404`
- **THEN** the system SHALL fail that resolution without applying consistency retries or creating a replacement

### Requirement: Actionable report problem context
The report SHALL make blocking errors, retryable failures, degradations, warnings, and safe normalizations distinguishable and SHALL identify the affected page or resource whenever that context is known.

#### Scenario: Operator opens a report with problems
- **WHEN** the report contains an error, conflict, resource fallback, retryable failure, or degradation
- **THEN** non-zero problem counts SHALL appear in the unified overview and highlighted hierarchy rows SHALL lead to affected-page details with severity, phase, reason, retryability, occurrence count, and resource identity when applicable

#### Scenario: Operator inspects a page
- **WHEN** a selected page is expanded in the HTML report
- **THEN** it SHALL show its exact status, parent/depth, source and destination references, content metrics, resource outcomes and sizes, page-specific issues, fallbacks, normalizations, and available source/destination previews

#### Scenario: Link traversal was not collected
- **WHEN** page or subtree scope has content links but no linked-scope traversal edges
- **THEN** the report SHALL explain that traversal edges were not collected for that scope while retaining source link metrics, rather than presenting an unexplained empty graph

#### Scenario: Report views are compared
- **WHEN** an operator compares HTML, downloadable JSON, terminal completion output, and `reports list`
- **THEN** source page totals, exclusive page outcomes, resource outcomes, and warning/error counts SHALL agree

### Requirement: Reconciled comment outcome reporting
Terminal summaries, state run counters, report JSON/HTML, and the report catalog SHALL derive comment source totals and current comment outcomes from one deduplicated record.

#### Scenario: Mixed outcomes
- **WHEN** selected pages include verified archives, source-inventory warnings, API failures, confirmed empty discussions, stale prior archives, and disabled comments
- **THEN** every selected page SHALL reconcile to exactly one comment outcome, intermediate planned work SHALL finalize as dependency-blocked or not-started when applicable, and issue counts SHALL match across all report surfaces

#### Scenario: Actual destination preview
- **WHEN** an archive comment was created or updated remotely
- **THEN** the report SHALL preview the body read back from destination rather than only the intended render

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

#### Scenario: Page preparation exists without final processing
- **WHEN** a live run ends while a selected page remains discovered, planned, or skeleton-created
- **THEN** its final outcome SHALL be not-started and documentation SHALL state that a previously verified mapping or full bootstrap body may already exist
- **AND** files and archives still planned SHALL become blocked when their page is failed, conflict, or blocked, and otherwise not-started

### Requirement: Preserved external references
The system SHALL preserve source-external HTTP(S) references as external references without treating their continued external nature as an incomplete transfer.

#### Scenario: External image is preserved
- **WHEN** a source page embeds an image outside the source provider's managed resources
- **THEN** the destination SHALL retain its absolute URL and available alt and dimension metadata, verification SHALL require that representation, and the page MAY remain complete

#### Scenario: Managed image upload fails
- **WHEN** a source-managed image cannot be copied and remains linked to its source download URL
- **THEN** the resource SHALL be failed for unsuccessful transfer or partial for confirmed upload with unavailable read-back, and the verified page SHALL be partial because the requested managed resource is incomplete

### Requirement: Resumable source resource download
The system SHALL retain stable partial download state and resume from a verified byte boundary when the source proves range continuity, while safely restarting when continuity cannot be established.

#### Scenario: Provider accepts byte range
- **WHEN** a retryable interruption leaves a partial file and the source responds with a matching partial-content range
- **THEN** the next attempt SHALL append from the confirmed byte offset and verify the final size and SHA-256 before cache promotion

#### Scenario: Provider ignores or invalidates range
- **WHEN** the source returns a full body, a mismatched content range, or a changed validator for a resume request
- **THEN** the system SHALL discard only the stale partial bytes and restart the resource from byte zero without concatenating incompatible content

#### Scenario: Download remains interrupted
- **WHEN** all bounded download attempts end in retryable failures
- **THEN** the system SHALL retain a validated partial checkpoint for a later run, classify the resource as retryable, and SHALL NOT expose the partial file as a complete cache object

#### Scenario: Destination rejects resource size
- **WHEN** a destination rejects an otherwise verified resource because of an attachment-size limit
- **THEN** the system SHALL retain the verified source cache, preserve a usable source reference in the page, mark the resource failed and the verified page partial, record the limit rejection as non-retryable, and report the exact size plus provider action and ordinary migrate rerun needed after that prerequisite changes

### Requirement: Mention completeness and observability
The system SHALL verify and account for mentions independently from page, resource, and comment counts while deriving page completeness from preserved information rather than notification delivery.

#### Scenario: Mention representation is verified
- **WHEN** destination content is read back
- **THEN** each source mention SHALL correspond to exactly one matching native marker, safe link, preserved token, or text fallback

#### Scenario: Mention representation is missing
- **WHEN** a source mention has no verified destination representation
- **THEN** body verification SHALL reject a complete result, identify the missing mention representation, and mark the owning page partial or failed according to the existing body-verification rules; documentation SHALL identify the standalone mention `failed` value as reserved until a producer records it

#### Scenario: Transfer progress is shown
- **WHEN** mention inventory or resolution is active
- **THEN** terminal, state, JSON, and HTML report totals SHALL reconcile discovered page and comment occurrences, unique identities, native, linked, text, preserved, unresolved, and failed outcomes while omitting zero-valued presentation counters

## REMOVED Requirements

### Requirement: Content and resource fidelity
**Reason**: Replaced by a consolidated current contract with redundant or superseded scenarios removed and unique behavior retained.
**Migration**: The active specification reference is now "Verified content and resource preservation"; this documentation change requires no runtime conversion or operator action.

### Requirement: Selectable migration scope
**Reason**: Replaced by a consolidated current contract with redundant or superseded scenarios removed and unique behavior retained.
**Migration**: The active specification reference is now "Unified page selection scope"; this documentation change requires no runtime conversion or operator action.

### Requirement: Explicit content normalizations and degradations
**Reason**: Replaced by a consolidated current contract with redundant or superseded scenarios removed and unique behavior retained.
**Migration**: The active specification reference is now "Explicit information-preserving transformations"; this documentation change requires no runtime conversion or operator action.

### Requirement: Complete subtree discovery integrity
**Reason**: Replaced by a consolidated current contract with redundant or superseded scenarios removed and unique behavior retained.
**Migration**: The active specification reference is now "Canonical subtree discovery integrity"; this documentation change requires no runtime conversion or operator action.

### Requirement: Provider-null Yandex Grid content
**Reason**: Replaced by a consolidated current contract with redundant or superseded scenarios removed and unique behavior retained.
**Migration**: The active specification reference is now "Independent provider-null Grid content"; this documentation change requires no runtime conversion or operator action.

### Requirement: Resumable preflight barrier for large sources
**Reason**: Replaced by a consolidated current contract with redundant or superseded scenarios removed and unique behavior retained.
**Migration**: The active specification reference is now "Structural preflight and independent enrichment barrier"; this documentation change requires no runtime conversion or operator action.

## ADDED Requirements

### Requirement: Verified content and resource preservation
The system SHALL preserve supported headings, paragraphs, lists, quotes, code, tables, grids, notes, cuts, tabs, links, anchors, images, and streamed attachments through the closest safe destination representation.

#### Scenario: Internal references and resources
- **WHEN** a page references another selected page, anchor, image, or downloadable attachment
- **THEN** the rendered destination SHALL use the resolved destination page, anchor, and resource location rather than a stale source-internal reference

#### Scenario: Unsupported rich content
- **WHEN** a construct cannot be represented natively
- **THEN** the system SHALL provide a readable destination-safe representation, retain raw source when needed for completeness, and classify verified full preservation as adaptation or absent/unverified information as degradation

#### Scenario: Legacy inline formatting and implicit links
- **WHEN** source content contains a bare HTTP(S) URL, vendor text color, checklist item, explicit anchor, ordered-list start, or image dimensions
- **THEN** the final destination SHALL use the closest safe clickable or formatted representation and SHALL NOT expose supported markup tokens as literal text

### Requirement: Unified page selection scope
The system SHALL expose `--scope page|subtree|linked`, default to `subtree`, and freeze the selected set before destination mutation.

#### Scenario: Page scope
- **WHEN** `--scope page` is selected
- **THEN** only the resolved root page and its resources SHALL be transferred and descendant pages SHALL NOT be requested or created

#### Scenario: Subtree scope
- **WHEN** scope is omitted or `--scope subtree` is selected
- **THEN** the root and all accessible structural descendants SHALL be transferred

#### Scenario: Linked scope
- **WHEN** `--scope linked` is selected
- **THEN** the root and every accessible same-boundary page transitively referenced from selected page content or page-reference/include constructs SHALL be transferred without a depth limit

#### Scenario: Link leaves the selected scope
- **WHEN** a selected page links to an accessible page outside `page` or `subtree` scope
- **THEN** the system SHALL keep or safely normalize that link as an external source reference rather than rewriting it to a nonexistent destination page

#### Scenario: Single-page rerun with shared state
- **WHEN** page scope reuses state containing mappings for the source root and prior descendants
- **THEN** the system SHALL resume or update only the selected root mapping and SHALL NOT mark, update, move, or delete unselected mappings or destination pages

### Requirement: Explicit information-preserving transformations
The system SHALL distinguish safe provider normalizations, lossless adaptations, and meaningful information loss without deriving impact from free-form warning text.

#### Scenario: Empty source heading is removed
- **WHEN** source conversion produces a heading with no title or meaningful content
- **THEN** the system SHALL remove only that heading, preserve neighboring anchors, strip terminal control codes from its diagnostic, and record a safe normalization without making the page partial

#### Scenario: Formatting structure is adapted without losing information
- **WHEN** a destination reshapes a layout, heading, list, tab set, media embed, or formula while retaining its complete ordered payload and references
- **THEN** verification SHALL record an adaptation and the page SHALL remain complete

#### Scenario: Dynamic table is materialized
- **WHEN** a dynamic table is rendered as a static destination table
- **THEN** every source row, cell value, and representable reference SHALL be verified and the page SHALL remain complete with an adaptation notice

#### Scenario: Meaningful data is lost
- **WHEN** the destination omits text, a table cell, code block, link, image, attachment reference, anchor, meaningful macro payload, or comment
- **THEN** verification SHALL report data loss and the page SHALL fail or remain partial according to whether a complete readable body still exists

#### Scenario: Storage normalization preserves XML-safe void elements
- **WHEN** empty headings are removed from Confluence Storage Format containing void elements such as line breaks or horizontal rules
- **THEN** the normalized output SHALL retain XML-safe self-closing syntax accepted by Confluence

### Requirement: Canonical subtree discovery integrity
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

#### Scenario: Detail fetch fails
- **WHEN** any selected descendant cannot be loaded or lacks required content or hierarchy fields
- **THEN** the run SHALL report that page and stop before destination mutation rather than silently omitting it

#### Scenario: Intermediate ancestor is unavailable or filtered
- **WHEN** a selected page's immediate source parent is not selected but a higher selected ancestor exists
- **THEN** the page SHALL attach to the nearest selected ancestor and the hierarchy gap SHALL be recorded

### Requirement: Independent provider-null Grid content
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

#### Scenario: Ordinary page has no inline content field
- **WHEN** a non-Grid page response omits or invalidates content required to represent that page
- **THEN** the response SHALL remain an invalid provider contract and SHALL NOT be silently classified as an empty page

#### Scenario: Ordinary page is semantically empty
- **WHEN** a valid ordinary page has an explicit string body that contains no meaningful content
- **THEN** existing semantic-empty handling SHALL apply and the page MAY remain complete without a fallback

### Requirement: Structural preflight and independent enrichment barrier
Migration SHALL require complete selected topology, immutable page identity, ordinary page content, and resource enumeration before mutation, while checkpointing independent enrichment outcomes so recoverable resource payload failures do not block unrelated branches.

#### Scenario: Late transient structural source failure
- **WHEN** required hierarchy, page identity, ordinary page content, or resource enumeration fails after other selected pages have completed inventory
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

#### Scenario: Required preflight cannot be completed
- **WHEN** structural or required-content recovery remains exhausted
- **THEN** terminal and report output SHALL state exact failed operations, inspected and remaining counts, retryability, checkpoint reuse, destination mutation count zero, and the canonical `ywtc retry <run-id>` action

#### Scenario: Only retryable enrichments remain
- **WHEN** required preflight is complete but one or more independent enrichments remain retryable
- **THEN** terminal and report output SHALL distinguish topology, page bodies, resource enumeration, resource payload outcomes, and affected partial pages without calling the full inventory incomplete

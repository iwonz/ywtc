# wiki-migration Delta

## ADDED Requirements

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

## MODIFIED Requirements

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

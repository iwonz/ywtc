# comment-archives Specification

## Purpose
Preserve accessible page discussions as verifiable, resumable archives across remote providers and portable filesystem exports without impersonating source authors or silently losing referenced files.

## Requirements

### Requirement: Provider-neutral page comment inventory
When comments are enabled, the system SHALL inventory all accessible footer and inline comments attached to each selected page, including nested replies, author fields exposed to the token, timestamps, resolution/deletion status, and inline source context.

#### Scenario: Complete forest
- **WHEN** a page contains multiple top-level threads and replies at arbitrary supported depths
- **THEN** the system SHALL discover each accessible entry exactly once, preserve parent-child order, and report exact thread, comment, and participant counts

#### Scenario: Malformed reply graph
- **WHEN** an API returns duplicate entries, an orphan, or a reply cycle
- **THEN** the system SHALL retain every uniquely identified entry in a deterministic readable position, record the anomaly, and SHALL NOT loop indefinitely

#### Scenario: Disabled comments
- **WHEN** the operator supplies `--no-comments`
- **THEN** the system SHALL issue no comment read or write request and SHALL mark comments skipped without changing the transfer state identity

### Requirement: Authorship and discussion fidelity
The archive SHALL preserve source attribution inside its text while the destination object remains authored by the configured token user. It SHALL retain dates, statuses, inline context, deleted tombstones, and reply nesting, and SHALL exclude reactions.

#### Scenario: Partially disclosed identity
- **WHEN** the provider exposes only some of display name, username, public name, email, or provider ID
- **THEN** the system SHALL label the author using the first available value in that order and SHALL NOT attempt to disclose hidden fields

#### Scenario: Thread participants
- **WHEN** a top-level thread contains several authors across nested replies
- **THEN** the archive SHALL list unique participants by provider user ID in first-appearance order before the rendered conversation

#### Scenario: Inline resolved and deleted entries
- **WHEN** a comment has inline context, is resolved, or is returned as deleted
- **THEN** the archive SHALL retain the available quote and a compact status or tombstone at the original hierarchy position

### Requirement: Native archive presentation with safe fallback
The system SHALL create one archive object or page section per source page, place each top-level thread in a native collapsible block when supported, and fall back to nested quotes or escaped code without omitting source text.

#### Scenario: Native collapsible content
- **WHEN** the destination supports expand, cut, or details content
- **THEN** each top-level thread SHALL be independently collapsible and nested replies SHALL remain visibly hierarchical

#### Scenario: Destination rejects rich archive body
- **WHEN** a native collapsible representation is unsupported or rejected
- **THEN** the system SHALL retry with a readable nested-quote representation and finally an escaped code representation while recording the fallback

#### Scenario: Oversized comment body
- **WHEN** the full archive exceeds a destination comment limit
- **THEN** the system SHALL preserve the complete Markdown archive as a page attachment and create a compact index comment linking to it with `partial` status

### Requirement: Exact comment attachment collection
The system SHALL archive only page attachments explicitly linked from comment bodies, resolve them through exact resource aliases, and leave ambiguous, unavailable, or external references as source links with recorded issues.

#### Scenario: Referenced attachment
- **WHEN** a comment contains an exact link to an available page attachment
- **THEN** the system SHALL download and verify the file, replace the body reference with its hash-prefixed archive filename, and include it in the page comment ZIP manifest

#### Scenario: Plain filename text
- **WHEN** a comment mentions a filename without an attachment link
- **THEN** the system SHALL preserve the text and SHALL NOT infer or download an attachment

#### Scenario: Reused or colliding files
- **WHEN** several comments reference identical bytes or different hashes share the same initial prefix or filename
- **THEN** identical bytes SHALL appear once and prefixes SHALL extend deterministically until every archive filename is unique

### Requirement: Deterministic comment attachment archive
Each page with comment attachments SHALL receive one streamed ZIP named from its canonical page key and comment fingerprint, containing safe hash-prefixed files and a deterministic manifest with provenance, sizes, and SHA-256 values.

#### Scenario: Remote destination
- **WHEN** comment files are archived to a remote page
- **THEN** the ZIP SHALL be uploaded as a page attachment and referenced natively from the archive comment

#### Scenario: Filesystem destination
- **WHEN** comment files are exported to Markdown or HTML
- **THEN** the ZIP SHALL be stored beside that page's attachments and linked through a verified relative path

#### Scenario: Interrupted retry
- **WHEN** a verified ZIP is already cached or mapped from a previous run
- **THEN** a rerun SHALL reconcile and reuse it without downloading, storing, or uploading duplicate bytes

### Requirement: Resumable archive lifecycle
The system SHALL fingerprint the normalized source discussion and persist comment status, destination identity and history, archive mapping, counts, and last error so unchanged reruns are idempotent and changed discussions are handled without deletion.

#### Scenario: Unchanged discussion
- **WHEN** the source fingerprint and verified destination archive match the previous run
- **THEN** the system SHALL reuse the existing comment and ZIP without creating duplicates

#### Scenario: Changed discussion on update-capable destination
- **WHEN** the source fingerprint changes and the existing archive has not been edited by a user
- **THEN** the system SHALL update it and verify the new archive while preserving destination history in state

#### Scenario: Changed discussion on append-only destination
- **WHEN** the destination cannot update comments
- **THEN** the system SHALL append a fingerprinted replacement revision, retain the prior comment, and record the revision relationship

#### Scenario: User-edited or stale archive
- **WHEN** a destination archive was manually edited or previously archived source entries are no longer returned
- **THEN** the system SHALL preserve existing data, mark conflict or stale state, and SHALL NOT overwrite or delete it

### Requirement: Independent comment failure status
A comment inventory, attachment, archive write, or verification failure SHALL NOT block successful page body and ordinary resource transfer, but it SHALL make that page and run `partial` or `failed` for comments with an actionable issue.

#### Scenario: Comment API failure
- **WHEN** comments cannot be read for one selected page
- **THEN** the system SHALL continue transferring all page bodies and ordinary resources and report that page's comment status as failed

#### Scenario: No source comments
- **WHEN** a complete inventory proves that a page has no comments
- **THEN** the page MAY be complete without a destination archive comment

#### Scenario: Verified archive
- **WHEN** archive text, hierarchy, participants, placeholders, and ZIP reference are read back and match the normalized source
- **THEN** the page's comment status SHALL be complete and MAY contribute to overall page completion

### Requirement: Comment link boundaries
Internal links inside comments SHALL be rewritten to mapped destination pages when available, external or unavailable links SHALL remain source links, and comment links SHALL NOT add pages to linked-scope discovery.

#### Scenario: Selected internal target
- **WHEN** a comment links to another selected page with a verified destination mapping
- **THEN** the archive SHALL link to that destination page and preserve its anchor when representable

#### Scenario: Unselected linked page
- **WHEN** a comment links to a page not otherwise selected by page content or hierarchy
- **THEN** the link SHALL remain directed to source and SHALL NOT expand the frozen transfer graph

### Requirement: Dependency-aware comment archive outcomes
The system SHALL distinguish dry-run plans, dependency-blocked archives, and interrupted archives from comment operations that were actually attempted and failed.

#### Scenario: Destination page is unavailable
- **WHEN** a destination page fails or is blocked before comment processing can begin
- **THEN** its enabled comment archive SHALL be `blocked`, SHALL identify the upstream page and cause, and SHALL NOT issue a destination comment mutation

#### Scenario: Live run stops before comment processing
- **WHEN** a non-dry-run is interrupted before an otherwise independent comment archive begins
- **THEN** that archive SHALL be `not-started` rather than `planned` or `failed`

#### Scenario: Dry-run plans a comment archive
- **WHEN** a dry-run includes comments for a selected page
- **THEN** its comment archive outcome SHALL be `planned`

#### Scenario: Upstream page recovers on rerun
- **WHEN** a repeated run successfully creates or reconciles a page whose comment archive was blocked
- **THEN** the archive SHALL resume through its ordinary idempotent create, update, or verification flow without requiring `--fresh`

#### Scenario: Blocked archive is reported
- **WHEN** a page dependency prevents comment archival
- **THEN** the blocked archive SHALL contribute to dependent-block totals and SHALL NOT be counted as an independent comment API error

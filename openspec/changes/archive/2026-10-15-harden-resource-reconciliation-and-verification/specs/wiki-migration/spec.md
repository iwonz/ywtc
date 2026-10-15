# Spec Delta

## ADDED Requirements

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

#### Scenario: Missing page is recreated
- **WHEN** a destination page is recreated after a persistent missing mapping
- **THEN** its old attachment mappings SHALL be reset, verified cache files SHALL be reused, and its expected hierarchy SHALL be restored where supported

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
- **THEN** warning and error counts SHALL agree and SHALL distinguish safe normalizations, degradations, retryable failures, and final errors

#### Scenario: Resource bytes are reported
- **WHEN** resource metadata is absent or inaccurate but a file is downloaded or verified
- **THEN** byte totals SHALL use the actual persisted size and represent unavailable sizes as unknown rather than zero

## MODIFIED Requirements

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

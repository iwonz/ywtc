## MODIFIED Requirements

### Requirement: Non-destructive behavior
The system MUST NOT automatically delete destination content, implicitly adopt unrelated pages, or store credentials in state and reports. Only separately confirmed synchronization decisions SHALL move proved mapped published leaf pages to a supported reversible trash; source deletion, purging and child deletion remain forbidden.

#### Scenario: Source page removed after migration
- **WHEN** a previously migrated source page is absent on a later run
- **THEN** the destination page SHALL remain untouched and the report SHALL identify it as stale

#### Scenario: Explicit trash exclusion exists
- **WHEN** a later migration encounters a confirmed operator-trash exclusion
- **THEN** its mapping and exclusion SHALL remain readable, the page SHALL be reported as intentionally excluded, and implicit recovery SHALL not recreate it

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

#### Scenario: Native page reference changes representation
- **WHEN** Confluence removes a redundant content ID but retains title and space, and fresh ID and exact title lookups prove the same immutable page
- **THEN** verification SHALL accept this specific normalization while still rejecting a different title, space, target, label, missing reference or unproved identity

#### Scenario: Destination applies lossless adaptation
- **WHEN** all data and meaningful references remain represented but the destination changes layout, presentation, or interactive behavior through a documented static equivalent
- **THEN** verification SHALL return complete and record an adaptation

#### Scenario: Destination applies meaningful simplification
- **WHEN** destination simplification omits meaningful source information or cannot be semantically verified
- **THEN** verification SHALL return partial and identify the degradation

#### Scenario: Destination preview is reported
- **WHEN** a page body has been verified or rejected
- **THEN** its report comparison SHALL use the body actually read from the destination rather than the body submitted by ywtc

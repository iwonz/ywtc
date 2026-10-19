# Spec Delta

## ADDED Requirements

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


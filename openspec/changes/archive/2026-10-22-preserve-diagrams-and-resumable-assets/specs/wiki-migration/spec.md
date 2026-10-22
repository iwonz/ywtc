# Spec Delta

## ADDED Requirements

### Requirement: Embedded diagram preservation
The system SHALL discover supported inline and fenced diagram constructs before vendor transformation, represent each construct explicitly, and preserve its source payload plus a safe visual or readable destination representation.

#### Scenario: Inline Draw.io data URI
- **WHEN** Yandex Wiki content contains a Draw.io directive with an inline data URI
- **THEN** the system SHALL validate and fingerprint the decoded payload without passing the unbounded token to Diplodoc
- **AND** it SHALL transfer the diagram source and a safe renderable or downloadable representation instead of a generic oversized-token marker

#### Scenario: Text diagram source
- **WHEN** a page contains a recognized Mermaid, PlantUML, or D2 source block
- **THEN** the system SHALL preserve the exact source text and language identity
- **AND** it SHALL use a proven native destination construct or a safe code/source fallback that retains all diagram data

#### Scenario: Native provider representation is available
- **WHEN** the destination adapter proves that it supports the diagram kind and exact macro or directive contract
- **THEN** the system SHALL render the native representation and verify the retained source identity

#### Scenario: Native provider representation is unavailable
- **WHEN** no proven native destination contract exists
- **THEN** the system SHALL attach or export the original source and include a safe visual or readable fallback
- **AND** it SHALL classify a complete source-preserving conversion as an adaptation rather than a degradation

#### Scenario: Diagram payload is invalid
- **WHEN** an inline diagram cannot be decoded, parsed, or represented with its original payload intact
- **THEN** the page SHALL be partial with a typed degradation that identifies the affected diagram and retained raw snapshot

### Requirement: Diagram-aware completeness verification
The system SHALL include every discovered diagram in semantic verification so a page cannot be complete when a diagram source, visual representation, or destination reference is missing or corrupt.

#### Scenario: Complete adapted diagram
- **WHEN** the destination contains the verified original diagram source and the expected safe representation or proven native construct
- **THEN** verification SHALL accept the diagram as complete and report any representation change as an adaptation

#### Scenario: Missing diagram artifact
- **WHEN** a discovered diagram is absent from the final destination body or its managed artifact cannot be verified
- **THEN** verification SHALL reject a complete outcome and identify the exact missing diagram artifact

#### Scenario: Same-vendor transfer
- **WHEN** source and destination support the same native diagram syntax
- **THEN** verification SHALL require preservation of the native source payload and its provider reference rather than a lossy textual substitute

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
- **THEN** the system SHALL retain the verified source cache, preserve a usable source reference in the page, mark the resource and page partial, and report the exact size plus provider action needed

### Requirement: Bounded diagram preprocessing
Diagram extraction SHALL scan page content in linear bounded work, avoid decoding arbitrary data URIs, and remain responsive to progress and cancellation on very large inline payloads.

#### Scenario: Very large supported diagram
- **WHEN** a recognized diagram directive contains a multi-megabyte supported payload
- **THEN** extraction SHALL identify its boundaries with deterministic linear work and fixed-size decode/hash chunks rather than a catastrophic regular expression
- **AND** the surrounding inventory operation SHALL remain observable and return to the existing cooperative cancellation checkpoint after the bounded scan

#### Scenario: Unrecognized large token
- **WHEN** page content contains an oversized token that is not a supported diagram payload
- **THEN** the existing bounded fallback SHALL remain readable and partial with the raw source retained

#### Scenario: Active content in diagram payload
- **WHEN** an SVG or diagram payload contains script-capable or externally executable content
- **THEN** previews SHALL sanitize active content while retaining the original source as a non-executed managed artifact

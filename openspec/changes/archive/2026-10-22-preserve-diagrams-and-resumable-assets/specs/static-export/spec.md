# Spec Delta

## ADDED Requirements

### Requirement: Portable diagram export
Markdown and HTML exports SHALL preserve recognized diagram source payloads as local managed artifacts and render a safe offline representation without external runtime dependencies.

#### Scenario: HTML diagram export
- **WHEN** a selected page contains a recognized diagram
- **THEN** the HTML export SHALL contain a safe local visual representation or readable source fallback, a link to the original diagram source artifact, and no executable source script

#### Scenario: Markdown diagram export
- **WHEN** a selected page contains Mermaid, PlantUML, D2, or Draw.io content
- **THEN** the Markdown export SHALL retain a fenced or linked source representation and use relative paths for generated diagram artifacts

#### Scenario: Diagram filename collision
- **WHEN** multiple diagrams produce the same preferred artifact filename
- **THEN** the export SHALL assign deterministic hash-qualified names and rewrite each page reference to the corresponding artifact

#### Scenario: Export is repeated
- **WHEN** an unchanged managed export is produced again
- **THEN** diagram paths and hashes SHALL remain stable and the export SHALL NOT create duplicate artifacts

### Requirement: Export diagram completeness
The export manifest and report SHALL account for every discovered diagram and distinguish native preservation, complete adaptation, and incomplete fallback.

#### Scenario: All diagram data is available
- **WHEN** every diagram source and local representation verifies by size and hash
- **THEN** the page MAY be complete even when its visual form is an adaptation

#### Scenario: Diagram artifact is unavailable
- **WHEN** a required diagram source or representation cannot be written or verified
- **THEN** the page SHALL be partial or failed according to body availability and the manifest SHALL identify the missing artifact

# Spec Delta

## ADDED Requirements

### Requirement: Packaged diagram and large-resource regressions
Project and package checks SHALL exercise diagram preservation and resumable resource transport with deterministic fixtures that do not contain organization data or require external provider access.

#### Scenario: Large inline Draw.io fixture
- **WHEN** the test suite processes a page containing a megabyte-scale inline Draw.io payload
- **THEN** it SHALL complete within bounded time, preserve source and representation hashes, keep progress responsive, and reject a false complete result if the diagram is omitted

#### Scenario: Diagram format matrix
- **WHEN** golden conversion tests run
- **THEN** they SHALL cover Draw.io, Mermaid, PlantUML, and D2 for native preservation where supported and source-preserving adaptation elsewhere

#### Scenario: Interrupted range download
- **WHEN** a local provider fixture interrupts a resource response and later serves a valid byte range
- **THEN** tests SHALL prove only the remaining bytes are transferred and the promoted cache object matches the expected SHA-256

#### Scenario: Invalid resume response
- **WHEN** the fixture ignores a range or returns an incompatible validator or content range
- **THEN** tests SHALL prove the client restarts safely without corrupt concatenation

#### Scenario: Package is installed in isolation
- **WHEN** the packed CLI processes diagram fixtures and resumable downloads outside the source checkout
- **THEN** required runtime assets and dependencies SHALL be present while source payload fixtures, cache files, and generated reports remain excluded from the package

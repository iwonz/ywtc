## ADDED Requirements

### Requirement: Reviewed managed export synchronization
Synchronization SHALL expand matching managed Markdown/HTML exports through verified staging, retain established paths and kept/unchanged payloads, update selected objects and affected references/navigation, and atomically promote the complete tree. Filesystem destinations SHALL not offer provider trash.

#### Scenario: New pages become accessible
- **WHEN** synchronization adds pages to an existing managed export
- **THEN** established page paths SHALL remain stable, new paths SHALL be allocated without collisions, and manifest/navigation/archive artifacts SHALL describe the full verified result

#### Scenario: Export changed after review
- **WHEN** the managed tree or manifest no longer matches the reviewed baseline
- **THEN** application SHALL require a fresh plan without overwriting the changed destination

#### Scenario: Existing content is kept
- **WHEN** a page is kept or unchanged
- **THEN** its payload SHALL be reused except for separately reviewed minimal reference repairs and required generated navigation

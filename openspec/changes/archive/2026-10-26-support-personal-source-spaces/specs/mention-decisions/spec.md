## ADDED Requirements

### Requirement: Personal-root mention selection
Source-only mention export SHALL accept the same personal page and space roots and scope/status semantics as migration while scanning only real selected pages and enabled comments.

#### Scenario: Whole personal space is scanned
- **WHEN** mentions export selects a space with subtree scope
- **THEN** it SHALL scan independent branches as well as homepage descendants without resource APIs, destination calls, container creation or migration state changes

#### Scenario: Empty personal space is scanned
- **WHEN** a complete subtree inventory contains no real pages
- **THEN** the document SHALL contain an empty entries list and complete inventory without invented page or comment occurrences

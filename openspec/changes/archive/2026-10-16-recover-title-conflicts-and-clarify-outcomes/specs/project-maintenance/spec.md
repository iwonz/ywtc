# Spec Delta

## ADDED Requirements

### Requirement: Transfer outcome documentation
The README SHALL define current page and file outcome semantics inside the existing Reports section without introducing another second-level section.

#### Scenario: Page status is inspected
- **WHEN** an operator reads `### Статусы переноса` under `## Отчёты`
- **THEN** a page-status table SHALL define `complete`, `partial`, `failed`, `blocked`, `conflict`, `planned`, and `not-started`
- **AND** it SHALL state whether destination data was written and the appropriate user action for each status

#### Scenario: File status is inspected
- **WHEN** an operator reads the same subsection
- **THEN** a separate file-status table SHALL define `complete`, `partial`, `failed`, `blocked`, `planned`, and `not-started`
- **AND** it SHALL explain that `planned` is exclusive to dry-run while `blocked` identifies an unmet page dependency

#### Scenario: Failure and dependency are compared
- **WHEN** an operator compares `failed` with `blocked`
- **THEN** the documentation SHALL explain that `failed` means an operation was attempted unsuccessfully while `blocked` means it was intentionally not attempted because an upstream dependency failed or conflicted

#### Scenario: README structure is checked
- **WHEN** the status documentation is added
- **THEN** the README SHALL retain its exact thirteen second-level headings and SHALL NOT duplicate status definitions in another section

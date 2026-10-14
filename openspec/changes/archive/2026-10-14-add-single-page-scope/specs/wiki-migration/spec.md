## ADDED Requirements

### Requirement: Selectable migration scope
The system SHALL migrate the complete accessible subtree by default and SHALL provide an explicit single-page mode that selects only the exact source page while preserving all supported content and resources belonging to that page.

#### Scenario: Default subtree scope
- **WHEN** the operator starts a migration without the single-page option
- **THEN** the system SHALL discover and migrate the accessible source root and its descendants with their hierarchy preserved

#### Scenario: Single-page scope
- **WHEN** the operator supplies `--single-page`
- **THEN** the system SHALL migrate only the exact source page, SHALL report one selected page and zero descendants, and SHALL NOT request or create descendant pages

#### Scenario: Link leaves the selected scope
- **WHEN** the selected page links to an unselected descendant or any other Wiki page outside the active scope
- **THEN** the system SHALL keep that link pointing to Yandex Wiki rather than rewriting it as a migrated Confluence page link

#### Scenario: Single-page rerun with shared state
- **WHEN** single-page mode reuses state that contains mappings for the source root and prior descendants
- **THEN** the system SHALL resume or update only the selected root mapping and SHALL NOT mark, update, move, or delete the unselected descendant mappings or destination pages

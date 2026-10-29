## ADDED Requirements

### Requirement: Recognizable work area navigation
The control center SHALL provide labeled work areas with thematic leading icons, an explicit active state, concise localized guidance and a visible new-migration action. Its wordmark SHALL read ywtc without a trailing underscore. The layout SHALL remain flat and usable by keyboard on narrow and wide screens.

#### Scenario: Operator switches work area
- **WHEN** an operator selects reports, tasks, decisions, synchronization or connections
- **THEN** the selected button SHALL expose its active state beyond color, retain a readable label and show guidance relevant to that work area
- **AND** decorative icons SHALL NOT duplicate the accessible button name

#### Scenario: Viewport or theme changes
- **WHEN** the application is viewed in light or dark theme on desktop or mobile
- **THEN** navigation labels, workspace controls and the new-migration action SHALL remain usable without horizontal page overflow
- **AND** the desktop navigation rail SHALL adapt to a labeled mobile arrangement without changing operation semantics or introducing external UI requests

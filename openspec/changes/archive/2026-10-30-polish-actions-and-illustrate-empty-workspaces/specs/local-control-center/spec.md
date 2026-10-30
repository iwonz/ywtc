## MODIFIED Requirements

### Requirement: Recognizable work area navigation
The control center SHALL provide an expandable workspace sidebar, thematic labeled work areas, an explicit active state, localized guidance and a visible new-migration action. Its wordmark SHALL read ywtc without a trailing underscore or migration-center caption. The layout SHALL remain flat and usable by keyboard on narrow and wide screens.

#### Scenario: Operator switches work area
- **WHEN** an operator selects connections, reports, tasks, synchronization or mentions and hashtags
- **THEN** the selected button SHALL expose its active state beyond color, retain an accessible name and show relevant guidance
- **AND** decorative icons SHALL NOT duplicate the accessible button name

#### Scenario: Viewport or theme changes
- **WHEN** the application is viewed in light or dark theme on desktop or mobile
- **THEN** navigation, workspace controls and new-migration actions SHALL remain usable without horizontal page overflow
- **AND** operation semantics and the absence of external UI requests SHALL remain unchanged

#### Scenario: Workspace navigation is collapsed
- **WHEN** the operator collapses or expands the sidebar
- **THEN** workspace controls SHALL remain in that sidebar, icon controls SHALL retain accessible labels and keyboard help, and expansion preference SHALL survive reload without storing private form data
- **AND** navigation SHALL order connections before migrations/reports, tasks, synchronization and mentions/hashtags; decorative header/sidebar rules and the redundant local-folder caption SHALL be absent

#### Scenario: Project repository is opened
- **WHEN** the operator activates the rightmost header control
- **THEN** its genuine GitHub mark SHALL identify the official project repository, which SHALL open in a new tab with opener isolation and no background prefetch

#### Scenario: Report reference is activated
- **WHEN** an eligible HTTP(S) source, destination or file reference icon is activated
- **THEN** it SHALL act as a native isolated new-tab link without opening the row dialog; missing or unsafe references SHALL remain disabled

## ADDED Requirements

### Requirement: Resilient action composition
Visible text action buttons SHALL pair a thematic leading icon with a readable label. Labels, icons, loading indicators and focus affordances SHALL fit their container in either locale without clipping or horizontal page overflow. Existing icon-only controls and semantic selection controls SHALL retain their established accessible interaction.

#### Scenario: Long localized action is shown in a narrow container
- **WHEN** an action such as workspace connection is rendered in a narrow sidebar, toolbar or modal
- **THEN** its icon SHALL remain to the left of the complete readable label, its hit target SHALL grow or wrap appropriately, and tooltips SHALL NOT invalidate its layout styles

#### Scenario: Actions are operated by keyboard
- **WHEN** the operator focuses, activates or disables an action
- **THEN** its accessible name, focus indication and existing confirmation requirements SHALL remain intact; decorative icons SHALL be hidden from assistive naming

### Requirement: Illustrated empty work areas
Successfully loaded empty connections, reports, tasks, synchronization and mention/hashtag areas SHALL display distinct local project-style illustrations, localized explanations and an appropriate next action. Empty pagination SHALL be absent. Missing data SHALL NOT be presented as completed work or hide errors.

#### Scenario: Workspace has no objects in the selected area
- **WHEN** a successful collection read returns no objects
- **THEN** the corresponding themed empty state SHALL explain what belongs there and offer a safe existing setup, analysis or navigation action without automatically starting a migration
- **AND** illustrations SHALL be bundled, noninteractive, decorative, transparent and legible in light/dark themes and narrow layouts without external requests

#### Scenario: Collection has not been successfully read
- **WHEN** a collection is still loading or its request fails
- **THEN** the UI SHALL show loading or actionable error evidence rather than a successful empty-state illustration

#### Scenario: Filter has no matches
- **WHEN** existing data does not match a search or filter
- **THEN** the UI SHALL explain the lack of matches separately from an empty workspace and offer a way to clear the filter without changing stored data

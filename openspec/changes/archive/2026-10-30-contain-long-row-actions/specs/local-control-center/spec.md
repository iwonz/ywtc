## MODIFIED Requirements

### Requirement: Resilient action composition
Visible text action buttons SHALL pair a thematic leading icon with a readable label. Labels, icons, loading indicators and focus affordances SHALL fit their container in either locale without clipping or horizontal page overflow. Existing icon-only controls and semantic selection controls SHALL retain their established accessible interaction.

#### Scenario: Long localized action is shown in a narrow container
- **WHEN** an action such as workspace connection is rendered in a narrow sidebar, toolbar or modal
- **THEN** its icon SHALL remain to the left of the complete readable label, its hit target SHALL grow or wrap appropriately, and tooltips SHALL NOT invalidate its layout styles

#### Scenario: Actions are operated by keyboard
- **WHEN** the operator focuses, activates or disables an action
- **THEN** its accessible name, focus indication and existing confirmation requirements SHALL remain intact; decorative icons SHALL be hidden from assistive naming

#### Scenario: Long data labels share a row
- **WHEN** page titles, profile names or other unbroken data labels share a row with action controls and status indicators
- **THEN** text actions SHALL yield available width and wrap, icons SHALL remain legible and row content SHALL stay within the page at supported desktop/mobile widths in both locales

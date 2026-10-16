# Spec Delta

## ADDED Requirements

### Requirement: Portable layout export
Filesystem export SHALL preserve normalized page layouts as responsive semantic HTML and SHALL retain every ordered cell when the selected static format lacks a native column model.

#### Scenario: Layout is exported to HTML
- **WHEN** a normalized page contains one or more supported layout sections
- **THEN** static HTML SHALL render each section as an accessible responsive grid, preserve cell order and contents, and collapse columns without loss on narrow viewports

#### Scenario: Layout is exported to Markdown
- **WHEN** a normalized page contains columns and Markdown cannot express their layout portably
- **THEN** Markdown SHALL emit every cell in deterministic reading order, record a layout degradation, and retain the raw source snapshot

#### Scenario: Empty page is exported
- **WHEN** a selected source page is semantically empty
- **THEN** its file SHALL contain only the normal page wrapper or empty document body and SHALL NOT contain a source-content fallback

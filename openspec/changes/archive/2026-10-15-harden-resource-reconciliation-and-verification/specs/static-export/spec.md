# Spec Delta

## ADDED Requirements

### Requirement: Materialized navigation directives
Filesystem exports SHALL render supported source navigation directives as deterministic links to selected exported pages.

#### Scenario: Tree is exported to Markdown
- **WHEN** a selected YFM page contains a tree directive and Markdown export is requested
- **THEN** the directive SHALL become a nested relative-link list of selected descendants within its requested depth and sort order

#### Scenario: Tree is exported to HTML
- **WHEN** a selected YFM page contains a tree directive and HTML export is requested
- **THEN** the directive SHALL become semantic navigation markup whose relative links work through `file://` and static hosting

#### Scenario: Referenced descendant is not selected
- **WHEN** the source hierarchy contains a descendant outside the frozen selected graph
- **THEN** the materialized tree SHALL omit that page without producing a broken local link

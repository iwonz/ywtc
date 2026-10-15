# Spec Delta

## ADDED Requirements

### Requirement: Provider-neutral source status selection
The system SHALL expose `--source-status all|current` for `migrate` and `doctor`, default to `all`, always retain the explicitly selected root, and apply the filter to automatically discovered pages only when the source adapter can determine the requested status.

#### Scenario: Default Yandex subtree
- **WHEN** a Yandex Wiki subtree contains accessible `actual` and `obsolete` descendants and source status is omitted or `all`
- **THEN** the system SHALL select both statuses by omitting the actuality filter

#### Scenario: Current Yandex subtree
- **WHEN** the operator selects `--source-status current` for a Yandex Wiki subtree
- **THEN** the system SHALL select `actual` descendants, retain the explicit root, and report every otherwise accessible excluded descendant as `source-status`

#### Scenario: Confluence source status
- **WHEN** a Confluence hierarchy response identifies page status
- **THEN** `current` SHALL retain only current descendants while `all` SHALL retain every accessible structural page exposed by that hierarchy API

#### Scenario: Unsupported status classification
- **WHEN** the chosen source, scope, or API cannot determine a requested non-default source status
- **THEN** preflight SHALL fail before destination mutation with provider- and scope-specific guidance

### Requirement: Complete subtree discovery integrity
The system SHALL exhaust hierarchy pagination, validate every selected page detail, and freeze an exact unique rooted tree before any destination mutation.

#### Scenario: Cursor pagination exceeds one page
- **WHEN** a descendant response includes a next cursor even when the current result count is below the requested page size
- **THEN** discovery SHALL continue until no next cursor remains and SHALL include each immutable page ID exactly once

#### Scenario: Invalid pagination contract
- **WHEN** a cursor repeats, an immutable ID is returned with conflicting locators, or a returned page lies outside the requested subtree
- **THEN** discovery SHALL fail as an incomplete source inventory before destination mutation

#### Scenario: Detail fetch fails
- **WHEN** any selected descendant cannot be loaded or lacks required content or hierarchy fields
- **THEN** the run SHALL report that page and stop before destination mutation rather than silently omitting it

#### Scenario: Intermediate ancestor is unavailable or filtered
- **WHEN** a selected page's immediate source parent is not selected but a higher selected ancestor exists
- **THEN** the page SHALL attach to the nearest selected ancestor and the hierarchy gap SHALL be recorded

### Requirement: Destination hierarchy reconciliation
The system SHALL compare every mapped destination parent with the frozen projected source parent and repair safe mismatches top-down without deleting destination data.

#### Scenario: Unchanged Confluence page has the wrong parent
- **WHEN** a mapped Confluence page still matches the last verified ywtc content but its parent differs from the expected mapped parent
- **THEN** the system SHALL move it through the deployment-specific update API, read it back, and require the expected parent before processing descendants

#### Scenario: Mapped page was changed by a user
- **WHEN** a page with the wrong parent has a meaningful content change after the last verified run
- **THEN** the system SHALL mark it conflict and block its selected descendants without moving or recreating it

#### Scenario: Destination cannot move pages
- **WHEN** an unchanged mapped page has the wrong parent and the destination adapter cannot move it safely
- **THEN** the system SHALL create a source-derived replacement under the expected parent, preserve the old ID in state history, reset resource mappings, and leave the old page untouched

#### Scenario: Hierarchy repair fails
- **WHEN** move, recreation, or parent verification fails
- **THEN** the affected page SHALL fail and selected descendants SHALL remain blocked rather than being created under the wrong parent

### Requirement: Observable source selection coverage
The system SHALL reconcile discovered, selected, excluded, inventoried, and transferred page counts from one source-selection record in terminal output, state run history, HTML/JSON reports, and the report catalog.

#### Scenario: Discovery completes
- **WHEN** a source graph is frozen
- **THEN** output SHALL show the explicit root, returned descendant count, selected count, source-status exclusions, maximum depth, and inventory completeness before writes begin

#### Scenario: Source status changes between runs
- **WHEN** the same canonical endpoints are rerun with another source status
- **THEN** state identity SHALL remain stable, newly selected pages SHALL be added without duplicates, and mappings outside the current selection SHALL remain untouched and be reported as stale

#### Scenario: Hierarchy is repaired
- **WHEN** a destination page is moved or replaced to restore its expected parent
- **THEN** terminal output and report metadata SHALL identify the page, old parent or mapping, new parent or mapping, and verified outcome without exposing credentials

## ADDED Requirements

### Requirement: Personal source roots
The system SHALL accept Yandex Wiki personal-page URLs and Confluence Data Center/Cloud space-root URLs through existing source options, distinguishing a real page from a space without changing destination locator semantics.

#### Scenario: Yandex personal URL
- **WHEN** source is a readable `/users/<login>/` page
- **THEN** its URL, slug and immutable ID SHALL select the same real page with ordinary scope, resources, comments and mention rules

#### Scenario: Confluence space URL
- **WHEN** source uses `spaces/viewspace.action?key=...`, `/display/~...` or Cloud `/wiki/spaces/~...[/overview]`
- **THEN** the source SHALL resolve by the exact opaque key to a space identity without treating the key or homepage as its immutable page ID

### Requirement: Complete space selection
A Confluence space source SHALL select all accessible structural pages for subtree, only its homepage for page, or linked traversal starting at its homepage for linked, using existing source-status filtering and complete inventory barriers.

#### Scenario: Independent space branches
- **WHEN** subtree selects a space with homepage descendants and independent top-level pages
- **THEN** every accessible selected real page SHALL appear exactly once, with exhaustive pagination and verified space membership

#### Scenario: Homepage is absent
- **WHEN** space metadata has no homepage
- **THEN** subtree SHALL still enumerate pages and allow an empty space, while page and linked SHALL fail clearly before mutation

#### Scenario: Required page cannot be hydrated
- **WHEN** selected page details or pagination cannot be verified
- **THEN** the run SHALL retain available discovery evidence and stop before destination mutation

### Requirement: Separate resumable space container
A space-root transfer SHALL create one destination section named after the source space, place real top-level pages beneath it, and checkpoint its mapping separately from page outcomes using the immutable source space ID.

#### Scenario: Hierarchy is transferred
- **WHEN** a space transfer executes
- **THEN** selected page parent relationships SHALL be preserved under the generated section, missing ancestors SHALL produce hierarchy gaps, and source-space links SHALL target that section

#### Scenario: Space metadata changes
- **WHEN** space URL, name or homepage changes on a repeated run
- **THEN** the same state and section mapping SHALL be reused without duplicating real pages, while existing page-root state IDs remain unchanged

#### Scenario: Container fails
- **WHEN** the destination section cannot be confirmed
- **THEN** one container root issue SHALL explain causally blocked pages without counting the section as a source page

### Requirement: Space-aware source coverage
Terminal and HTML/JSON reporting SHALL distinguish a space container from real selected, excluded, inventoried and transferred pages, retain retry identity, and never inflate source page or comment totals with generated navigation objects.

#### Scenario: Space report is inspected
- **WHEN** a space-root run produces a plan or report
- **THEN** it SHALL show space selection counts instead of root-plus-descendant wording, display its separate container and mapping outcome, and reconcile real-page totals across surfaces

#### Scenario: Source commands share resolution
- **WHEN** doctor, interactive migration or mentions export receives a supported personal source
- **THEN** it SHALL use the same root and scope semantics without profile lookup, browser scraping or additional source permissions

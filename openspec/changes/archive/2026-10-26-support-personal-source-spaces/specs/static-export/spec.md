## ADDED Requirements

### Requirement: Space-root static index
Markdown and HTML space exports SHALL generate a root navigation index named after the source space and retain real page hierarchy beneath it without counting the index as an extra source page.

#### Scenario: Personal space is exported
- **WHEN** Markdown or HTML exports a selected Confluence space
- **THEN** its index SHALL link to all selected top-level branches, page and space references SHALL resolve locally, and manifest totals SHALL count only real source pages

#### Scenario: Space is empty
- **WHEN** a readable space contains no selected real pages
- **THEN** export SHALL publish a valid empty index and complete matching manifest through ordinary transactional staging

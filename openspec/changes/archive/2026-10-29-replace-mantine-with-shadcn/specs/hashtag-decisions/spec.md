## MODIFIED Requirements

### Requirement: Private offline hashtag editing
The system SHALL atomically publish decisions.json and a self-contained shadcn/ui index.html into absent or empty output with search, skip/text/url filters, contexts, preview, delete/undo, import/download, keyboard, mobile, themes and virtualization. No background network requests SHALL occur.

#### Scenario: Invalid or unsaved edits
- **WHEN** import is invalid, current edits are unsaved or a decision is incomplete
- **THEN** invalid import SHALL retain current data, replacement SHALL request confirmation, and invalid decisions SHALL block download identifying the entry

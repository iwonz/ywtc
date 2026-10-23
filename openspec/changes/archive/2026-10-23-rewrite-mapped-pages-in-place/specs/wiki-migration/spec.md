## ADDED Requirements

### Requirement: Explicit identity-preserving rewrite
The CLI SHALL expose `migrate --rewrite` and `-R` for remote transfers using existing page mappings. Rewrite SHALL rebuild selected source content and force verified in-place page updates without creating or deleting destination pages or changing state identity.

#### Scenario: Existing page is equivalent
- **WHEN** rewrite selects a mapped page whose content is already semantically equivalent
- **THEN** the system SHALL write the current source representation as a new destination revision and retain its immutable ID, title allocation, attachments, and children

#### Scenario: Mapping is absent
- **WHEN** any selected page lacks an existing destination mapping
- **THEN** rewrite SHALL stop before destination mutations and explain that an ordinary migration is required to establish mappings

#### Scenario: Mapped page is unavailable
- **WHEN** bounded consistency reads cannot confirm the saved immutable destination ID
- **THEN** rewrite SHALL fail the page without allocating, adopting, or creating a replacement and SHALL preserve its mapping

#### Scenario: Hierarchy cannot be repaired in place
- **WHEN** a mapped page has the wrong parent and the destination cannot move it
- **THEN** rewrite SHALL fail without recreating the page and SHALL block dependent work causally

#### Scenario: Invalid rewrite combination
- **WHEN** rewrite is combined with fresh mappings or filesystem export
- **THEN** CLI and library validation SHALL reject the combination before provider requests

#### Scenario: Rewrite preview
- **WHEN** rewrite is combined with dry-run
- **THEN** the system SHALL show its rebuilt plan without page, resource, comment, or state mutations

#### Scenario: Ordinary migration remains unchanged
- **WHEN** rewrite is absent
- **THEN** ordinary semantic reuse, new-page creation, and confirmed missing-mapping recovery SHALL retain their existing behavior

#### Scenario: Rewrite evidence and continuation
- **WHEN** a rewrite produces invocation evidence or a continuation command
- **THEN** that evidence SHALL retain the rewrite policy without credentials or changing canonical state identity

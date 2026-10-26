## ADDED Requirements

### Requirement: Literal mention decision precedence
Explicit mention decision URLs and labels SHALL remain literal after source page, space navigation and resource rewriting, without preventing ordinary source references from targeting migrated objects.

#### Scenario: Mention URL matches source space
- **WHEN** a page contains a space-navigation link and an explicit mention decision pointing to the same source space URL
- **THEN** ordinary navigation SHALL target the migrated section while the mention SHALL retain the configured URL and escaped label

#### Scenario: Destination reads the final representation
- **WHEN** the rendered representation is verified
- **THEN** semantic mention verification SHALL use the literal decision URL rather than an automatically rebound space or page reference

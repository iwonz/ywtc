# static-export Delta

## MODIFIED Requirements

### Requirement: Transactional export replacement
The system SHALL build output in adjacent staging, serialize promotion for one destination, and replace only an empty directory or an export owned by a matching strict current ywtc manifest.

#### Scenario: Existing managed export
- **WHEN** a completed export replaces a prior export whose manifest exactly matches the current structure, `tool: ywtc`, and canonical identity
- **THEN** the system SHALL retain a timestamped backup, atomically promote staging where the filesystem permits, and restore the backup if promotion fails

#### Scenario: Existing empty destination
- **WHEN** the destination already exists as a directory with no entries
- **THEN** the system SHALL treat it as safe new output and atomically promote the verified staging tree

#### Scenario: Concurrent export
- **WHEN** another live export holds the destination promotion lease
- **THEN** the second export SHALL stop before replacement with active non-secret operation information and SHALL preserve staging-independent destination data

#### Scenario: Unmanaged destination
- **WHEN** a non-empty destination lacks a manifest or its manifest is malformed, has unknown fields, uses another tool marker, or has another identity
- **THEN** the system SHALL preserve the destination, stop before replacement, and explain how to choose an empty or currently managed destination without converting the manifest

### Requirement: Static export safety and integrity
The system SHALL sanitize active content, prevent traversal, verify generated references, and distinguish lossless static adaptations from omitted or unverified information.

#### Scenario: Unsafe source markup retains its payload
- **WHEN** executable behavior is removed while all non-executable source payload and references remain readable
- **THEN** the export SHALL record an adaptation and MAY remain complete

#### Scenario: Unsafe source data is omitted
- **WHEN** sanitization cannot retain meaningful source payload or a safe reference
- **THEN** the export SHALL retain a raw snapshot, record a degradation, and mark the page partial

#### Scenario: Unsafe source markup
- **WHEN** source content contains executable script, unsafe URL schemes, or traversal filenames
- **THEN** the system SHALL exclude executable behavior, use safe local names, preserve all safely representable payload, and classify any missing information as degradation

### Requirement: Portable layout export
Filesystem export SHALL preserve normalized page layouts as responsive HTML and SHALL retain every ordered cell as a complete adaptation when a static format lacks columns.

#### Scenario: Layout is exported to HTML
- **WHEN** a normalized page contains one or more supported layout sections
- **THEN** static HTML SHALL render each section as an accessible responsive grid, preserve cell order and contents, and collapse columns without loss on narrow viewports

#### Scenario: Layout is exported to Markdown
- **WHEN** a normalized page contains columns and Markdown cannot express their layout portably
- **THEN** Markdown SHALL emit every cell in deterministic reading order, record an adaptation, and keep the page complete when all cell information verifies

#### Scenario: Empty page is exported
- **WHEN** a selected source page is semantically empty
- **THEN** its file SHALL contain only the normal page wrapper or empty document body and SHALL NOT contain a source-content fallback

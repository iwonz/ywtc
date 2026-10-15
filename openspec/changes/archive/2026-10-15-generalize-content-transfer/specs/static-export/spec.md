## ADDED Requirements

### Requirement: Portable filesystem destinations
The system SHALL export a selected source graph to either Markdown or static HTML when `--destination` is a directory and `--format markdown|html` is supplied.

#### Scenario: Markdown export
- **WHEN** an operator selects Markdown format
- **THEN** the export SHALL contain an index, page files, relative internal links, local attachments, a manifest, and raw snapshots only for degraded pages

#### Scenario: Static HTML export
- **WHEN** an operator selects HTML format
- **THEN** the export SHALL contain an index, page routes, local assets and attachments, navigation hierarchy, and relative links that work through `file://` and ordinary static hosting without a CDN

### Requirement: Transactional export replacement
The system SHALL build filesystem output in an adjacent staging directory and SHALL replace only an existing directory owned by a compatible ywtc manifest.

#### Scenario: Existing managed export
- **WHEN** a completed export replaces a prior managed export
- **THEN** the system SHALL retain a timestamped backup, atomically promote staging where the filesystem permits, and restore the backup if promotion fails

#### Scenario: Unmanaged destination
- **WHEN** a non-empty destination does not contain a compatible ywtc manifest
- **THEN** the system SHALL stop before replacement and explain how to choose an empty or managed destination

### Requirement: Optional streamed archive
The system SHALL support `--archive` only with a filesystem destination and SHALL create an additional uniquely named ZIP without deleting the exported directory.

#### Scenario: Archive requested
- **WHEN** a filesystem export completes with `--archive`
- **THEN** the system SHALL stream the final tree into a non-overwriting ZIP and report both paths

### Requirement: Static export safety and integrity
The system SHALL sanitize active source content, prevent path traversal, verify generated references, and record every omitted or degraded construct.

#### Scenario: Unsafe source markup
- **WHEN** source content contains executable script, unsafe URL schemes, or traversal filenames
- **THEN** the system SHALL exclude executable behavior, use safe local names, retain a raw snapshot as needed, and mark the degradation without writing outside the destination

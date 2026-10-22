# static-export Specification

## Purpose
Define portable, transactional, and loss-aware Markdown/HTML exports for page graphs and their attachments.

## Requirements

### Requirement: Portable filesystem destinations
The system SHALL export a selected source graph to either Markdown or static HTML when `--destination` is a directory and `--format markdown|html` is supplied, and SHALL describe the result with one strict unversioned manifest.

#### Scenario: Markdown export
- **WHEN** an operator selects Markdown format
- **THEN** the export SHALL contain an index, page files, relative internal links, local attachments, a manifest without a schema-version field, and raw snapshots only for degraded pages

#### Scenario: Static HTML export
- **WHEN** an operator selects HTML format
- **THEN** the export SHALL contain an index, page routes, local assets and attachments, navigation hierarchy, an unversioned manifest, and relative links that work through `file://` and ordinary static hosting without a CDN

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

### Requirement: Optional streamed archive
The system SHALL support `--archive` only with a filesystem destination and SHALL create an additional uniquely named ZIP without deleting the exported directory.

#### Scenario: Archive requested
- **WHEN** a filesystem export completes with `--archive`
- **THEN** the system SHALL stream the final tree into a non-overwriting ZIP and report both paths

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

### Requirement: Portable comment archive sections
When comments are enabled, Markdown and HTML exports SHALL include one page comment section containing every inventoried thread and reply, its participants and metadata, and links rewritten only to selected exported pages.

#### Scenario: Markdown comments
- **WHEN** a page with comments is exported as Markdown
- **THEN** its `Комментарии` section SHALL use independent `<details>` branches with readable nested replies and SHALL remain usable in a renderer without JavaScript

#### Scenario: HTML comments
- **WHEN** a page with comments is exported as HTML
- **THEN** its semantic comment section SHALL use accessible `<details>` elements and safe static markup without source scripts or remote runtime dependencies

#### Scenario: Comments disabled
- **WHEN** the operator uses `--no-comments`
- **THEN** no comment section or comment archive SHALL be generated and the manifest SHALL record comments as skipped

### Requirement: Transactional comment attachment export
Comment attachment ZIPs SHALL be written inside the export staging tree with safe relative paths and SHALL participate in the same verified atomic promotion or rollback as page content.

#### Scenario: Successful archive export
- **WHEN** referenced comment attachments are available
- **THEN** the page SHALL link to one deterministic ZIP beside its ordinary attachments and its manifest SHALL identify the path, fingerprint, file count, and verified byte count

#### Scenario: Comment archive failure
- **WHEN** a ZIP cannot be completed or verified
- **THEN** the export SHALL preserve the readable comment text, record its page as partial, and SHALL NOT publish a broken local archive link

### Requirement: Comment-aware export manifest
The strict current export manifest SHALL record per-page comment status, source counts, archive path, fingerprint, issues, revision/stale indicators, and whether comments were disabled without adding a schema-version field.

#### Scenario: Manifest reconciliation
- **WHEN** an export contains pages with comments, pages without comments, and a partial archive
- **THEN** manifest totals SHALL reconcile exactly with page entries, report totals, and generated files

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

### Requirement: Targeted managed export retry
A filesystem retry SHALL preserve the transactional export boundary while reusing verified files from a matching managed export and regenerating actionable page payloads plus affected global artifacts.

#### Scenario: Complete managed export exists
- **WHEN** retry targets Markdown or HTML and the destination has a matching current ywtc manifest
- **THEN** ywtc SHALL construct adjacent staging from that managed baseline, replace selected pages and resources, regenerate affected navigation and manifest data, verify the complete tree, and atomically promote it

#### Scenario: Managed baseline is unavailable
- **WHEN** no complete matching export can safely supply carried-forward files
- **THEN** ywtc SHALL announce a full export rebuild, reuse compatible source cache where possible, and SHALL publish only a completely verified staging tree

#### Scenario: Destination is unmanaged
- **WHEN** retry finds a non-empty filesystem destination without a matching current ywtc manifest
- **THEN** it SHALL refuse replacement before modifying that destination

#### Scenario: Archive policy is enabled
- **WHEN** a targeted export retry changes the managed output and its restored request enables archive creation
- **THEN** ywtc SHALL stream a new non-overwriting ZIP from the final verified tree and SHALL leave earlier archives untouched

### Requirement: Portable diagram export
Markdown and HTML exports SHALL preserve recognized diagram source payloads as local managed artifacts and render a safe offline representation without external runtime dependencies.

#### Scenario: HTML diagram export
- **WHEN** a selected page contains a recognized diagram
- **THEN** the HTML export SHALL contain a safe local visual representation or readable source fallback, a link to the original diagram source artifact, and no executable source script

#### Scenario: Markdown diagram export
- **WHEN** a selected page contains Mermaid, PlantUML, D2, or Draw.io content
- **THEN** the Markdown export SHALL retain a fenced or linked source representation and use relative paths for generated diagram artifacts

#### Scenario: Diagram filename collision
- **WHEN** multiple diagrams produce the same preferred artifact filename
- **THEN** the export SHALL assign deterministic hash-qualified names and rewrite each page reference to the corresponding artifact

#### Scenario: Export is repeated
- **WHEN** an unchanged managed export is produced again
- **THEN** diagram paths and hashes SHALL remain stable and the export SHALL NOT create duplicate artifacts

### Requirement: Export diagram completeness
The export manifest and report SHALL account for every discovered diagram and distinguish native preservation, complete adaptation, and incomplete fallback.

#### Scenario: All diagram data is available
- **WHEN** every diagram source and local representation verifies by size and hash
- **THEN** the page MAY be complete even when its visual form is an adaptation

#### Scenario: Diagram artifact is unavailable
- **WHEN** a required diagram source or representation cannot be written or verified
- **THEN** the page SHALL be partial or failed according to body availability and the manifest SHALL identify the missing artifact

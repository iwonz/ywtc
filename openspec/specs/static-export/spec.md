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
The system SHALL build filesystem output in an adjacent staging directory and SHALL replace only an existing directory owned by a strict current unversioned ywtc manifest containing the tool marker and matching canonical export identity.

#### Scenario: Existing managed export
- **WHEN** a completed export replaces a prior export whose manifest exactly matches the current structure, `tool: ywtc`, and canonical identity
- **THEN** the system SHALL retain a timestamped backup, atomically promote staging where the filesystem permits, and restore the backup if promotion fails

#### Scenario: Unmanaged destination
- **WHEN** a non-empty destination lacks a manifest or its manifest is malformed, has unknown fields, uses another tool marker, or has another identity
- **THEN** the system SHALL preserve the destination, stop before replacement, and explain how to choose an empty or currently managed destination without converting the manifest

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
Filesystem export SHALL preserve normalized page layouts as responsive semantic HTML and SHALL retain every ordered cell when the selected static format lacks a native column model.

#### Scenario: Layout is exported to HTML
- **WHEN** a normalized page contains one or more supported layout sections
- **THEN** static HTML SHALL render each section as an accessible responsive grid, preserve cell order and contents, and collapse columns without loss on narrow viewports

#### Scenario: Layout is exported to Markdown
- **WHEN** a normalized page contains columns and Markdown cannot express their layout portably
- **THEN** Markdown SHALL emit every cell in deterministic reading order, record a layout degradation, and retain the raw source snapshot

#### Scenario: Empty page is exported
- **WHEN** a selected source page is semantically empty
- **THEN** its file SHALL contain only the normal page wrapper or empty document body and SHALL NOT contain a source-content fallback

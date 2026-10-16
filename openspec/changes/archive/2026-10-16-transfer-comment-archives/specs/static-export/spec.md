# Spec Delta

## ADDED Requirements

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

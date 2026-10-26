# mention-decisions Specification

## Purpose
Provide a portable source-bound mention decision catalog and an offline editor that operators can prepare without destination access or remote mutations.

## Requirements

### Requirement: Strict source-bound decision document
The system SHALL accept one unversioned JSON document containing source provider/instance and entries with source identity, readable mention, and a `skip` or literal `url` decision. Unknown fields, duplicate canonical identities, unsafe URLs, and empty labels SHALL be rejected.

#### Scenario: Literal link decision
- **WHEN** an entry selects `url` with an absolute HTTP(S) URL without credentials
- **THEN** its optional text SHALL default to `@username` or the readable mention when username is absent, without interpreting placeholders

#### Scenario: Missing or deleted entry
- **WHEN** a recognized identity has no entry or selects `skip`
- **THEN** all its occurrences SHALL retain their safe source representation without a warning

#### Scenario: Identity is canonicalized
- **WHEN** entries contain account ID, user key, username, or ID
- **THEN** matching SHALL prefer them in that order, ignore username case only, reject duplicates, and never merge by display name

#### Scenario: Source binding differs
- **WHEN** configured source provider or canonical instance differs from the decision document
- **THEN** migration SHALL stop before provider requests without modifying the document

### Requirement: Source-only mention export
The CLI SHALL expose `mentions export --source --output` with source-profile, workdir, scope, source-status, comments, and concurrency aliases and existing migration defaults. It SHALL scan selected page bodies and enabled comment bodies/replies/inline contexts without rendering content, fetching resource payloads, accessing destination, or changing migration state.

#### Scenario: Complete scan
- **WHEN** all selected readable page and comment content is inspected
- **THEN** one entry per recognized identity SHALL be exported with `skip`, aggregated source occurrence references, and complete inventory, and the command SHALL return zero

#### Scenario: Partial scan
- **WHEN** discovery, a page, comments, or an identity cannot be completely inspected
- **THEN** available entries SHALL still be exported with incomplete inventory and redacted object-specific issues, and the command SHALL return one

#### Scenario: Comment boundary
- **WHEN** a comment links to another page
- **THEN** that link SHALL NOT expand linked scope and disabled comments SHALL cause no comment API call

#### Scenario: Export has no mapping dependency
- **WHEN** mapping mode points at a missing decision file
- **THEN** a valid source-only export SHALL still work without reading that file

### Requirement: Non-overwriting private bundle publication
Mention export SHALL produce `decisions.json` and a self-contained `index.html` through adjacent staging into an absent or empty selected directory, print both paths and an editor file URL, and preserve existing nonempty output.

#### Scenario: Output exists
- **WHEN** output is nonempty, is not a directory, or another export owns its publication lease
- **THEN** the command SHALL fail without replacing any existing output

#### Scenario: Export is cancelled
- **WHEN** SIGINT or SIGTERM interrupts scanning
- **THEN** available results SHALL identify incomplete inventory, no provider mutation SHALL occur, and the command SHALL return 130 or 143

### Requirement: Offline decision editing
The editor SHALL work through file URLs with embedded initial JSON, search, all/skip/url filters, source contexts, literal URL/text editing, deletion with undo, explicit JSON import, and JSON download. It SHALL remain keyboard accessible, responsive, themed, and usable with large catalogs.

#### Scenario: Decision is edited or removed
- **WHEN** an operator changes an entry or deletes it
- **THEN** download SHALL contain the current validated document, deletion SHALL omit that entry, and undo SHALL restore it

#### Scenario: Another file is opened
- **WHEN** an operator imports another valid decisions JSON
- **THEN** the entire current document SHALL be replaced only after unsaved-change confirmation; invalid imports SHALL leave it unchanged

#### Scenario: Link is incomplete
- **WHEN** a URL decision has an invalid URL or empty explicit label
- **THEN** saving SHALL be blocked with the affected entry identified

#### Scenario: Data is untrusted
- **WHEN** imported metadata contains script-like text or unsafe links
- **THEN** the editor SHALL escape data, reject unsafe actionable URLs, make no background request, and use no external assets

#### Scenario: Coverage is incomplete or empty
- **WHEN** an imported catalog has inventory failures or no entries
- **THEN** the editor SHALL show the actual coverage limitation or a concise empty state without inventing successful zero measurements

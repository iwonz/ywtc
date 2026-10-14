## Why

Yandex Wiki sections cannot be moved to Confluence Data Center with their hierarchy and embedded resources through a built-in migration path. A repeatable API-driven tool is needed to preserve as much current content as possible while making partial failures safe to resume.

## What Changes

- Add a Node.js 22 TypeScript CLI that accepts a Yandex Wiki source section and a Confluence parent page.
- Discover the complete accessible source subtree and migrate pages parent-first.
- Convert YFM content to Confluence storage format, including links, tables, code, standard callouts, collapsible sections, images, and attachments.
- Snapshot Yandex dynamic tables as static Confluence tables.
- Add dry-run, bounded concurrency, retry handling, atomic state, idempotent resume, verification, and JSON/Markdown reports.
- Add deterministic title disambiguation without deleting or silently overwriting unrelated Confluence content.

Non-goals: page history, comments, watchers, user/group permissions, live dynamic-table behavior, and automatic destination deletion.

## Capabilities

### New Capabilities

- `wiki-migration`: Discover, convert, migrate, resume, and verify a Yandex Wiki subtree in Confluence Data Center.

### Modified Capabilities

None.

## Impact

- Introduces a local CLI, environment configuration contract, migration state/report files, and API clients for Yandex Wiki and Confluence Data Center.
- Adds runtime dependencies for YFM transformation, HTML normalization, HTTP, validation, and concurrency control.
- Requires read access to the Yandex Wiki subtree and create/update/attachment access under the selected Confluence target.

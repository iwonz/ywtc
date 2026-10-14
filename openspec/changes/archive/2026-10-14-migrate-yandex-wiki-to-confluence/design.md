## Context

The project starts without an existing application. Yandex Wiki exposes page content, descendants, attachments, resources, and dynamic grids through its v1 API. Confluence Data Center 7.9+ exposes page and attachment operations through the content REST API and accepts Confluence storage XHTML. The two systems differ in title uniqueness, interactive markup, identity, and resource models.

## Goals / Non-Goals

**Goals:**

- Migrate every source page visible to the token while preserving hierarchy and current content.
- Preserve standard rich content and make unsupported content readable and auditable.
- Support safe dry-runs, retries, interruption, resume, reruns, and post-write verification.
- Keep credentials out of logs, state, reports, and source control.

**Non-Goals:**

- Migrating history, comments, permissions, watchers, or original authorship.
- Recreating dynamic tables as live Confluence databases or relying on marketplace macros.
- Deleting destination content or overwriting pages not created by this migration state.

## Decisions

1. **TypeScript on Node.js 22.** Native platform support plus the official Diplodoc transformer provides the strongest YFM coverage. Python was considered but would require reimplementing YFM extensions.
2. **Two-pass migration.** Pages are first created parent-first with placeholder bodies, establishing every destination ID. Attachments are then uploaded and final bodies are generated so internal links and attachment references can be rewritten deterministically.
3. **Confluence storage format.** Diplodoc produces HTML, which is parsed and converted to a conservative whitelist of storage XHTML and standard macros. Unsupported interactive constructs become readable static content and generate degradation records.
4. **Atomic local state.** A JSON state file maps source page/resource IDs to destination IDs/names. It is written through a temporary file and rename after each mutation. A rerun updates only mapped content; unrelated pages are never adopted implicitly.
5. **Stable title disambiguation.** Source-order-independent suffixes derived from the source slug are appended only when a title duplicates another source page or an existing page in the destination space.
6. **Retry and concurrency policy.** Reads and writes retry network errors, 429, and 5xx responses with bounded exponential backoff and Retry-After support. Work is limited by a configurable concurrency value; hierarchy-dependent page creation remains ordered.
7. **Partial failure policy.** Individual page/resource failures are recorded and migration continues where dependency safety permits. The process exits non-zero when any error remains.

## Risks / Trade-offs

- **YFM output contains browser-only widgets** → convert known widgets to standard Confluence macros or static sections, and report every degradation.
- **Confluence title uniqueness differs from Wiki** → preflight title resolution and deterministic suffixing.
- **Large attachments consume memory/disk** → download to an ignored cache and stream multipart uploads.
- **Tokens have incomplete visibility** → report discovered counts and permission failures; never claim inaccessible pages were migrated.
- **Process interruption leaves placeholder pages** → persist each mapping immediately and complete them on resume.
- **Destination changes during a run** → fetch the current version immediately before each update and fail clearly on unresolved version conflicts.

## Migration Plan

1. Validate environment and resolve source/target identifiers.
2. Discover and transform source metadata in dry-run mode; present conflicts and degradations.
3. Run the real migration with a dedicated state path.
4. Verify created pages and attachments, and review JSON/Markdown reports.
5. To roll back, use the report to identify created page IDs; deletion remains an explicit administrator action outside this tool.

## Open Questions

None for the initial release.

# Design

## Context

See proposal.md for motivation. Clean synchronized base is eb6929ff891412c79348d648075943ac01d478e0. The current implementation couples active mention modes to historical run values, has destination lookup adapters, and embeds report applications through Vite singlefile. Source graph discovery and bounded API policies already exist.

## Goals / Non-Goals

**Goals:** explicit portable decisions, consistent source scanning, safe incremental representation changes, usable partial exports and offline editing.

**Non-Goals:** user discovery, URL availability probes, automatic config conversion, new native notifications, source resource payload scanning, repairing real migrations, deleting provider content, or rewriting prior reports.

## Decisions

1. Separate current `MentionMode` (off/mapping) from recorded modes (also template/auto). Keep historical outcome counters readable, but current presentation produces only preserved/linked. Remove all lookup clients/capabilities and retired retry selection.
2. A browser-safe strict Zod contract owns JSON source binding, entries, occurrence metadata, and inventory. Identity priority is accountId/userKey/username/id, only username case-folds. Literal URLs must be HTTP(S) without credentials; default label is @username or readable mention. Missing decision means skip. Invalid identity is inventoried, never merged by name. Unknown/duplicate fields fail; no schema version.
3. A node-only loader resolves mappingFile relative to config, including tilde, validates source via canonical profile base URL, and pins a defensive snapshot before provider calls. Export parses config but does not load its mapping. Effective presentation fingerprints ignore paths, order, timestamps, and unused entries; page body and comment archive decisions are fingerprinted independently.
4. Shared source scanning is extracted from normalization without running Diplodoc. YFM protection excludes code, escapes, HTML attributes, URLs/emails and recognized diagram source; Confluence markup is parsed structurally. Comment body and inline context use the same scanner. CPU work returns to cooperative checkpoints between pages and entries.
5. Source-only export reuses adapter discovery and checkpoints in memory, collecting hydrated pages even when discovery reports known failures. It reads no attachments/grids/downloads and creates no migration state. Defaults are subtree/all/comments enabled/config concurrency. Partial results contain inventory.complete false and typed redacted issues. Exit is 0 complete, 1 partial, 2 usage/config, 130/143 signals.
6. Bundle publication holds a destination lease, refuses nonempty output before API access, stages beside output and rechecks emptiness before promotion. New artifacts use private file/directory permissions. Existing output is not overwritten; cancellation retains scanned results where publication is safe.
7. A separate Mantine/React singlefile editor uses embedded initial JSON, explicit file input and Blob download. It never fetches neighboring files or profile URLs. Import replaces all data only after validation and dirty confirmation. UI drafts preserve transient edits; serialization strips inactive URL fields for skip, rejects invalid links, and omits removed entries. One-step undo, search/filter, virtualized rows, expandable contexts, keyboard support, dark/light and zero-counter omission remain local.
8. Build and package smoke gates include the editor shell and source-only local API fixtures. Canonical README retains nine H2 and four existing common examples, adding mention workflow in its CLI/config sections. Current specs replace retired requirements; archive history is immutable.

## Risks / Trade-offs

- Literal mapping links may lead to unavailable profiles → do not promise reachability or probe them automatically.
- Same visible user may expose distinct IDs → do not infer identity by display name; keep distinct proven keys.
- Incomplete source APIs → publish a visibly partial inventory, never successful zero coverage.
- Local file origins cannot reliably fetch siblings → embed initial data and require explicit import for edited JSON.
- Changed mapping during a run → pin loaded decisions; use updated content on the next invocation.
- Old active configuration is invalid → fail with current field paths; preserve historical state without conversion or a migration guide.

## Delivery

The required security audit found a newly disclosed high-severity issue in transitive undici 7.30.0 (via Cheerio). Refresh only that compatible lockfile dependency to 7.30.1; retain the existing audit threshold and verify the resulting package with the same full checks. Moderate upstream findings without a fix remain visible, not ignored.

Test-first contract/scanner/integration/editor slices; full check, OpenSpec archive and strict validation before breaking commit. Recheck remote base before commit/push. Release Please must calculate 5.0.0; validate its metadata-only PR, publish through trusted npm workflow, and verify GitHub/npm/npx/Homebrew. Rollback does not require deleting remote objects or runtime data.

# Tasks

## 1. Resource identity and resumability

- [x] 1.1 Add preferred resource names, normalized alias indexing, and unambiguous reference resolution; verify duplicate-name URL/path/basename tests.
- [x] 1.2 Add case-insensitive deterministic destination-name allocation and remote attachment inventory reuse; verify occupied-name and same-name multi-resource tests.
- [x] 1.3 Persist actual size/hash/cache metadata immediately after download and reuse verified cache on resume; verify interrupted and failed-state retry tests.
- [x] 1.4 Reconcile uncertain uploads and existing attachments without overwriting unrelated data; verify hash-match adoption and safe suffix fallback tests.

## 2. Destination consistency and content verification

- [x] 2.1 Add confirmed-ID-only `404` consistency retries with injectable timing; verify `404 → 200` and new-locator no-retry tests.
- [x] 2.2 Add parent-aware mapping recovery and bootstrap recreation with ID history/resource reset; verify persistent `404`, missing-parent, hierarchy, and cache re-upload tests.
- [x] 2.3 Normalize empty headings and ANSI diagnostics while preserving anchors and XML-safe Confluence storage; verify safe, lossy, and void-element cases.
- [x] 2.4 Implement provider-aware structured verification with complete/partial/failed results; verify allowed Confluence normalization and all meaningful loss cases.

## 3. Directive rendering and diagnostics

- [x] 3.1 Model supported YFM tree directives and render Confluence children macros, preserved YFM, and static Markdown/HTML trees; verify renderer and export tests.
- [x] 3.2 Add a deduplicated typed issue collector and use it for state, terminal, JSON/HTML report, and catalog counts; verify retry deduplication and cross-view count equality.
- [x] 3.3 Report actual verified resource bytes and unknown metadata consistently, and verify report summaries and side-by-side destination provenance.

## 4. Integration and documentation

- [x] 4.1 Add integration regressions for duplicate Yandex resource names, partial-state repair, consistency recovery, content normalization, and tree-only pages.
- [x] 4.2 Update the existing README sections concisely for automatic attachment reconciliation, provider-aware verification, and issue categories; verify fixed heading order.
- [x] 4.3 Run focused tests and `npm run check`, then verify a resumed live transfer has no failed pages or attachment fallbacks except genuine degradations.

## Workflow follow-up

- Archive the change after every tracked task and project check succeeds.
- Run strict OpenSpec validation after archival.
- Commit with `fix(migration): reconcile resources and provider normalization`, push `master`, and verify the generated `3.2.1` release across GitHub, npm/npx, and Homebrew.

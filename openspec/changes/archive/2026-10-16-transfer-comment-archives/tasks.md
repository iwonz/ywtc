# Tasks

## 1. Public contract and normalized model

- [x] 1.1 Add default-on `--comments` / `--no-comments` parsing for migrate and doctor, update help, and verify CLI/default/state-identity behavior with unit and package smoke tests
- [x] 1.2 Add provider-neutral comment authors, entries, threads, inventories, archive mappings, statuses, and adapter capabilities/methods, and verify strict TypeScript plus malformed forest unit tests
- [x] 1.3 Extend current state with optional comment records and run counts, and verify existing state resumes, `--no-comments` preserves data, atomic persistence works, and no version branch is introduced

## 2. Provider API support

- [x] 2.1 Implement Yandex Wiki paginated top-level/thread reads and create-only archive comments with duplicate cursor/ID, orphan, cycle, auth, retry, and redaction contract tests
- [x] 2.2 Implement Confluence Data Center comment forest reads and archive create/update/read-back with pagination, storage body, author, version, permissions, and 7.9–11.x contract tests
- [x] 2.3 Implement Confluence Cloud footer/inline recursive reads, bulk author resolution, footer create/update/read-back, and error/pagination contract tests
- [x] 2.4 Add comment-aware read-only doctor probes and capability diagnostics, verifying unsupported reads fail actionably while unprovable writes warn without mutation

## 3. Archive normalization, rendering, and files

- [x] 3.1 Normalize authors, statuses, inline context, tombstones, replies, links, participants, anomalies, and fingerprints, and verify deterministic golden output plus comment links not expanding linked scope
- [x] 3.2 Render Confluence expand, YFM cut, Markdown/HTML details, nested quote, code, and oversized-index fallbacks, and verify semantic content across all remote/file directions
- [x] 3.3 Resolve only exact linked page resources, generate collision-safe hash-prefixed names and deterministic streamed ZIP/manifest output, and verify duplicates, prefix collisions, traversal, cache reuse, and byte/hash integrity

## 4. Pipeline, resume, and verification

- [x] 4.1 Inventory comments page-locally and integrate exact progress counters without blocking page mutation on comment failures, verified by mixed success/failure integration tests
- [x] 4.2 Transfer/reconcile archive ZIPs and comments after page resources, support Confluence updates, Yandex revisions, deleted comments, recreated pages, stale archives, and manual conflicts, and verify reruns create no unintended duplicates
- [x] 4.3 Read back and semantically verify archive text, hierarchy, participants, placeholders, links, and ZIPs, and verify complete/partial/failed page outcomes preserve successful main content
- [x] 4.4 Handle SIGINT/SIGTERM and retryable provider failures during comment work, and verify state/report checkpoints allow safe continuation

## 5. Filesystem export and reporting

- [x] 5.1 Add Markdown and HTML comment sections, archive placement, and comment-aware strict manifests inside transactional staging, and verify portable links, rollback, backups, disabled comments, and browser rendering
- [x] 5.2 Extend unified issue/outcome accounting, terminal plan/progress/summary, report JSON/HTML/catalog, and actual destination comment previews, and verify all counts reconcile without duplicated issues

## 6. Documentation and integration quality

- [x] 6.1 Update only the existing README sections for supported comments, limits, flags, state, reports, and common minimal usage, and verify the fixed 13-heading structure and package hygiene
- [x] 6.2 Run targeted provider, archive, resume, export, browser, performance, and package tests; fix all failures and verify `npm run check` succeeds
- [x] 6.3 Mark verified tasks complete, strictly validate the OpenSpec change, archive it into main specifications, and strictly validate all specifications again

## Workflow follow-up

- Fetch and compare `origin/master`, create `feat(migration): archive page comments`, and push without force after the worktree and checks are clean.
- Allow Release Please to prepare version 3.4.0, merge the release PR, and verify GitHub Release, npm/npx, and Homebrew publication when external workflows and owner permissions permit.

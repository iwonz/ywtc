## 1. Project and specification setup

- [x] 1.1 Configure the Node.js 22 TypeScript project, dependencies, scripts, environment example, and ignore rules
- [x] 1.2 Configure OpenSpec and validate the proposal, design, capability spec, and tasks

## 2. API and persistence foundation

- [x] 2.1 Implement validated configuration, CLI parsing, safe logging, retrying HTTP, and input resolution
- [x] 2.2 Implement Yandex Wiki pagination, page, attachment, resource, grid, and download operations
- [x] 2.3 Implement Confluence page resolution, lookup, create/update, multipart attachment, and verification operations
- [x] 2.4 Implement atomic state, cache layout, and JSON/Markdown reporting

## 3. Migration behavior

- [x] 3.1 Implement subtree discovery, hierarchy reconstruction, title conflict resolution, and dry-run preflight
- [x] 3.2 Implement YFM-to-storage conversion, internal link and anchor rewriting, attachment/image references, macros, and fallbacks
- [x] 3.3 Implement dynamic-grid snapshots and two-pass page/resource migration
- [x] 3.4 Implement resumable reruns, stale detection, bounded concurrency, final verification, and non-zero partial-failure exit

## 4. Quality and documentation

- [x] 4.1 Add unit tests for parsing, hierarchy, titles, conversion, grids, state, and redaction
- [x] 4.2 Add mocked client and migration integration tests including retry, dry-run, attachments, resume, and conflicts
- [x] 4.3 Document setup, tokens, commands, reports, limitations, TLS CA configuration, and recovery
- [x] 4.4 Run lint, typecheck, tests, build, strict OpenSpec validation, and archive the completed change

# Tasks

## 1. Title collision recovery

- [x] 1.1 Add provider-neutral duplicate-title error classification for Confluence Data Center and Cloud, and verify `400`/`409` duplicate fixtures are distinguished from ordinary bad requests
- [x] 1.2 Implement the bounded deterministic title candidate allocator for slug, canonical hash, Unicode, repeated conflicts, and the ten-candidate limit, and verify it with unit tests
- [x] 1.3 Route page creation and missing-mapping recreation through safe create-or-reconcile logic, and verify ambiguous responses only reuse parent- and bootstrap-matching ywtc pages
- [x] 1.4 Persist the accepted destination title and verify a repeated run resumes the recovered branch, files, and comments without duplicate pages or `--fresh`

## 2. Causal outcomes and state

- [x] 2.1 Extend page, resource, and comment state with `blocked`/`not-started` outcomes and optional causal fields, and verify existing current state files remain readable with unchanged state identity
- [x] 2.2 Persist failed-parent descendants as causally blocked and verify no page, file, or comment destination operation runs under an unavailable or incorrect parent
- [x] 2.3 Finalize untouched inventory as dry-run `planned`, interrupted live `not-started`, or dependency `blocked`, and verify a normally completed live run contains no `planned` outcomes
- [x] 2.4 Verify resume replaces blocked outcomes top-down once the upstream page succeeds and preserves existing verified destination objects

## 3. Reports and diagnostics

- [x] 3.1 Refactor issue accounting to distinguish root errors from dependent blocks and verify each blocked object carries upstream page, code, reason, and retry action without incrementing errors
- [x] 3.2 Derive terminal, state counters, report JSON/HTML, and `reports list` from the same exclusive outcomes and verify source totals, page/file/comment statuses, bytes, and causes agree
- [x] 3.3 Add causal terminal and HTML presentation for root errors and dependent objects, and verify browser smoke tests expose actionable grouped failures
- [x] 3.4 Add recognized construct or renderer context to empty-render raw fallback issues and verify Grid conversion remains an explicit degradation while preserved raw content remains `partial`

## 4. Documentation and integration

- [x] 4.1 Add separate page and file status tables under `## Отчёты` → `### Статусы переноса`, and verify meaning, destination writes, and operator action are documented without changing the thirteen H2 headings
- [x] 4.2 Add Data Center and Cloud contract regressions plus parent-failure, interruption, dry-run, live-run, and resume integration coverage, and verify the focused Vitest suites pass
- [x] 4.3 Run `npm run check`, package/browser smoke tests, and strict OpenSpec validation, and resolve every failure without including runtime state, reports, source content, or credentials

## Workflow follow-up

- Archive `recover-title-conflicts-and-clarify-outcomes`, sync the resulting specifications, and repeat strict OpenSpec validation.
- Synchronize with `origin/master`, commit as `fix(migration): recover title conflicts and explain blocked outcomes`, and push without force.
- Publish and verify `3.4.1` through GitHub Release, npm/npx, and Homebrew.

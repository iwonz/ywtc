# Tasks

## 1. Authoritative page lifecycle

- [x] 1.1 Extend destination/state models with confirmed provider versions and typed optimistic-revision failures; verify strict state round-trips and provider error classification tests.
- [x] 1.2 Remove fingerprint-based write vetoes from Confluence and Yandex adapters while retaining identity/title protection; verify mapped updates and unrelated-page safeguards in adapter tests.
- [x] 1.3 Implement semantic read-before-write, no-op reuse, final read-back checkpointing, and three bounded Confluence revision retries; verify body/title/version, normalization, empty-page, retry/exhaustion, and 401/403/404 cases.
- [x] 1.4 Reconcile mapped hierarchy independently of content drift and replan earlier conflict/blocked state top-down; verify parent repair and dependent resource/comment recovery without duplicates or `--fresh`.

## 2. Authoritative comment archives

- [x] 2.1 Update mapped Confluence comment archives from current source, retain Yandex append-only revisions, and checkpoint only verified read-back; verify unchanged reuse, changed archive, missing comment, race, stale, and ambiguous-identity outcomes.
- [x] 2.2 Reconcile comment/page/file outcome and issue totals after resumed false conflicts; verify terminal, state, report JSON/HTML, and catalog agree without derived blocked errors.

## 3. Compact report application

- [x] 3.1 Replace separate header/summary/root-causes/outputs/footer with one overview containing all required run, comparison, quality, path, result, and download data; verify React unit/build checks and report contract fixtures.
- [x] 3.2 Replace language/theme selects with tooltip-enabled icon-only cycles, embedded flag SVGs, accessible current/next labels, and safe storage; verify keyboard, tooltip, cycle, persistence, RU/EN, and light/dark browser cases.
- [x] 3.3 Update Playwright desktop/mobile/offline/privacy/visual coverage for the compact layout and absence of removed panels/disclaimer; verify the maintained browser suite and package report smoke test.

## 4. Documentation and acceptance

- [x] 4.1 Update only README `State` and `Отчёты` content for source-authoritative mappings, destination history, ownership-only conflicts, and compact report controls; verify the fixed thirteen H2 headings and documentation tests.
- [x] 4.2 Run focused migration, comment, state, report, browser, and package tests, then complete `npm run check` without weakening gates.
- [x] 4.3 Repeat the configured local migration with its existing ignored state and verify false conflicts/blocks recover, empty mapped pages are complete, native layouts remain verified, and no runtime artifact becomes tracked.

## Workflow follow-up

- Archive the OpenSpec change after all tracked tasks and checks pass.
- Run strict validation against the archived specifications and confirm no active changes remain.
- Commit as a breaking Conventional Commit, push `master`, complete the generated `4.0.0` Release Please flow, and verify GitHub, npm/npx, and Homebrew release channels.

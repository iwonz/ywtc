# Tasks

## 1. Durable execution and progress

- [x] 1.1 Add strict job/request/event contracts, atomic private manifests and ordered replay in src/jobs; verify tests/jobs-store.test.ts rejects secrets, traversal and invalid transitions and covers interrupted evidence.
- [x] 1.2 Extend src/progress.ts and Migrator callbacks with typed redacted progress/run/outcome events without parsing strings; verify tests/progress.test.ts and new event integration tests preserve existing terminal behavior.
- [x] 1.3 Extract programmatic operation execution with immutable requests, pinned policies, AbortSignal and typed results; verify local provider fixtures and migration/export signal tests.
- [x] 1.4 Add detached per-workspace coordinator, authenticated IPC, worker queue/cancel/recovery and foreground subscription; verify real subprocess tests prove FIFO, client independence, graceful stop, interrupted state and no automatic retry.
- [x] 1.5 Add ui/migrations/background CLI parsing and dispatch with documented aliases/exit semantics; verify tests/cli.test.ts and installed command help and update canonical CLI/job-status guidance.

## 2. Source analysis and selective correction

- [x] 2.1 Share one-pass source analysis for both scanners, catalog merge, revisioned drafts/publish/activation and config compare-and-swap; verify tests/decision-workspace.test.ts and source-only fixtures plus canonical decisions guidance.
- [x] 2.2 Add operator-selected retry plans, explicit terminal override and preview evidence binding; verify tests/targeted-operations.test.ts covers object-only work, ownership refusal, context and stale plans.
- [x] 2.3 Implement decisions-only in-place application and aggregate report carry-forward using verified existing IDs; verify page/comment mapping changes, deletion-to-skip, other policy preservation, no create/reparent and read-back failures.

## 3. Local web application

- [x] 3.1 Add Next.js 16.4.3 standalone build, lazy launcher and local static assets; verify production startup/port conflict and ordinary CLI startup without Next and update build/package hygiene.
- [x] 3.2 Implement bootstrap/session/Host/Origin security, bounded registered-workspace routes, catalog/state/report projections, isolated preview and SSE replay; verify tests/local-control-center.test.ts for CSRF, secrets, symlinks, cursor recovery and 10000-object pagination.
- [x] 3.3 Build Mantine workspace/profile setup and dry-run-first migration wizard with explicit live confirmation; verify Playwright localhost fixtures for config revisions, masked credentials, probe errors, destination types and form validation.
- [x] 3.4 Build state-grouped reports, read-only inspector, task list/progress/logs/stop and selective preview controls; verify browser reconnect, queue persistence, report navigation, stale preview and keyboard/mobile/themes/RU-EN.
- [x] 3.5 Integrate shared decision editors, combined analysis, drafts/revisions/activation and apply preview; verify browser import/edit/delete/undo/rescan/concurrent tab/apply scenarios without external UI requests.

## 4. Integrated delivery verification

- [x] 4.1 Extend installed-tarball smoke tests and CI platform coverage for UI/background/export/report paths; verify no source-only runtime dependencies or packaged private data.
- [x] 4.2 Review the complete diff and README nine-section contract, run npm run check and fix all failures, verify all requested acceptance scenarios and strict OpenSpec validation before archive.

## Workflow follow-up

- Archive and synchronize this change, rerun npm run spec:validate and confirm there is no unfinished active change.
- Fetch and compare origin/master to the recorded base before commit/push; validate the full Conventional Commit and actual range.
- Publish the next minor through Release Please only after all acceptance checks pass; verify GitHub, npm/npx and Homebrew without running a real migration.

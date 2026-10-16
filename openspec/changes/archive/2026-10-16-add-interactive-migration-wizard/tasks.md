# Tasks

## 1. CLI contract and shared execution

- [x] 1.1 Add every documented command-scoped short alias and conditional interactive source/destination parsing; verify focused CLI tests cover long/short equivalence, help, invalid non-interactive input, and deferred interactive combinations.
- [x] 1.2 Generalize the Clack prompt port for init and migrate without changing init behavior; verify existing interactive-init tests and typecheck pass.
- [x] 1.3 Extract a reusable migration command runner with structured result/report data and per-run signal cleanup; verify non-interactive migration tests retain current outputs, exit codes, retries, resume, conflicts, and report access.

## 2. Interactive migration workflow

- [x] 2.1 Implement the testable wizard draft and workdir/source/destination/scope/comments/archive state machine, including profile URL suggestions and nested init; verify scripted tests cover defaults, prefills, back/forward, all destination kinds, required fields, archive reset, cancellation, and workspace recovery.
- [x] 2.2 Implement review, dry-run, report-open, edit, repeat, exit, and explicit live actions with structured blocker gating; verify dry-run-to-live tests preserve the effective request and prevent live for incomplete inventory, root errors, failed, blocked, or conflicted outcomes.
- [x] 2.3 Wire `migrate -i` into CLI dispatch with TTY validation before any workspace/API action; verify subprocess tests return usage code 2 for non-TTY and cancellation/signal tests return 130/143.

## 3. Public guidance and package behavior

- [x] 3.1 Update the existing README sections so the minimum checklist has exactly installation, `ywtc init --interactive`, and `ywtc migrate --interactive`, and the parameter/examples tables document aliases and direct automation without duplication; verify heading order and documentation tests.
- [x] 3.2 Extend package smoke validation for interactive migration help, aliases, and non-TTY safety; verify packed-tarball tests make no workspace or network mutation.

## 4. Integrated verification

- [x] 4.1 Run focused CLI, init-wizard, migration-wizard, runner, and package tests and verify all new scenarios pass.
- [x] 4.2 Run `npm run check` and verify security, static analysis, unit/integration, browser, package, build, performance, and strict OpenSpec gates all pass without rewriting tracked files.

## Workflow follow-up

- Archive `add-interactive-migration-wizard` after every tracked task passes.
- Run strict OpenSpec validation after archival and verify there is no active change.
- Fetch `origin/master`, verify the pre-change base has not moved, create `feat(cli): add interactive migration wizard`, push `master`, and verify Release Please calculates the next minor release.

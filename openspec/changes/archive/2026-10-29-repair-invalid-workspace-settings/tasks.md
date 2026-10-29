# Tasks

## 1. Safe settings recovery

- [x] 1.1 Add safe invalid-config snapshots and confirmed atomic repair with hidden credential reuse, backup and revision handling; verify API regressions for init/mixed invalid settings, malformed YAML, stale writes and secret masking.
- [x] 1.2 Add recovery drafts, profile/policy/limit editing and readiness guidance to shadcn UI; verify end-to-end repair without CLI, draft immutability, backups and preserved credentials.
- [x] 1.3 Update canonical configuration guidance within nine README sections and verify documentation/spec consistency.

## 2. Integration

- [x] 2.1 Run npm run check including browser/package smoke and strict change validation.

## Workflow follow-up

- Archive, synchronize and strictly validate all specifications; confirm no active change remains.
- Fetch/compare recorded master base before commit/push, validate complete Conventional Commit messages and publish the patch through Release Please; verify GitHub/npm/npx/Homebrew.

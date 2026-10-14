## 1. Remove compatibility code

- [x] 1.1 Remove fallback locations and legacy-only state types/options from state resolution and storage.
- [x] 1.2 Remove legacy-only migrator, progress, and report metadata branches while preserving current automatic, explicit, and fresh behavior.

## 2. Clean current project surface

- [x] 2.1 Remove old runtime-layout guidance and exceptions from README, AGENTS, Git ignore, Biome, release checks, and current OpenSpec purpose.
- [x] 2.2 Move the local old runtime directory into a recoverable ignored backup under `.states/` without exposing it to automatic lookup.

## 3. Verification and completion

- [x] 3.1 Replace compatibility tests with current-only state, reporting, CLI, and release-hygiene coverage.
- [x] 3.2 Run focused tests and `npm run check`, fixing every failure without weakening checks.
- [x] 3.3 Archive the OpenSpec change and run strict validation with no active changes remaining.

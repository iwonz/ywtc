# Identity-preserving rewrite implementation plan

**Goal:** Rebuild current source representations without changing mapped destination page IDs.

**Architecture:** Add an optional rewrite execution policy alongside existing transfer options. Reuse current inventory, rendering, resource reconciliation, state locking, retry lineage, and reports. A separate untracked repair script supplies the migration-specific selection and performs the full original-graph mention audit.

**Tech Stack:** Existing strict TypeScript, Commander, provider adapters, PQueue, Vitest, and OpenSpec; no new dependencies.

## Global constraints

- No source or destination deletion, no credentials or migration-specific data in tracked files.
- No provider mutation during dry-run; preserve state identity and existing report history.
- Node.js >=24 and npm >=11.5.1.

## Decisions

1. `--rewrite` / `-R` requires all selected mappings and remote output. It conflicts with `--fresh` and `--format`; it is not title-based ownership adoption.
2. `src/cli-arguments.ts`, `src/migration-command.ts`, `src/interactive-migrate.ts`, and `src/retry-command.ts` carry the optional policy. `src/report-contract.ts` and the strict catalog invocation schema preserve optional evidence and continuation behavior without changing state identity.
3. `src/migrator.ts` validates incompatible options before adapter creation, opens a fresh source-inventory generation, bypasses completed normalized snapshots, validates mapping presence before destination work, forbids fallback creation/recreation, and passes `force` to the final mapped-page update. No empty intermediate body is written.
4. Ordinary runs remain source-authoritative and semantically reuse identical bodies. Rewrite deliberately permits an extra provider revision; mapped attachments remain reconciled rather than duplicated.
5. Retry selection remains actionable-only. The one-off script explicitly adds every problematic page and every page with mentions discovered by scanning all original IDs, carries successful mappings as context, and uses the same locks and reports. It stores backups and checkpoints only under ignored workdir runtime storage and makes no deletion calls.

## Test sequence

1. `tests/cli.test.ts`: long/short forms, conflicts, help, and retry parser; fail unknown-option assertions before implementing flags.
2. `tests/resume-conflict.test.ts`: identical mapped page receives a PUT only under rewrite, ID stays unchanged, fresh/format validation is pre-request, absent mapping makes zero mutations, missing confirmed page does not create a replacement, dry-run does not update, normal resume stays unchanged.
3. `tests/migration-content-safety.test.ts` and `tests/retry-report.test.ts`: no-create hierarchy behavior and optional invocation evidence.
4. `tests/interactive-migrate.test.ts` and `tests/migration-command.test.ts`: prefill, continuation, and restoration retain the flag.
5. Update `README.md` parameters/state guidance and `scripts/package-validation.ts` help smoke expectations; run focused tests after each task, then the complete quality gate.

## Risks and trade-offs

- Rewrite cannot recover an absent immutable ID without breaking incoming ID links: fail explicitly and leave ordinary recovery to a separate operator decision.
- Native auto mentions can notify verified users: honor the existing configured policy, keep archival comments non-native, show lookup outcomes, and avoid unnecessary repeated rewrite attempts.
- Deterministic renderer defects will not disappear after forced writes: never suppress verification; isolate only evidence-backed repair transformations and report remaining losses honestly.
- The entire source graph must be inspected to find mentions on previously complete pages: use bounded read concurrency and durable per-page checkpoints.

## Delivery

Archive and strictly validate the change, commit one audited feature, publish the next minor through Release Please, and verify GitHub/npm/npx/Homebrew. The temporary repair is separately previewed and executed against the authorized original workspace with recoverable snapshots and a final aggregate report. No tracked runtime data or migration guide.

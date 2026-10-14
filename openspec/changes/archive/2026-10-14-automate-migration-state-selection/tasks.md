## 1. State identity and persistence

- [x] 1.1 Implement normalized canonical migration identity, stable credential-free state IDs, and automatic/explicit runtime path resolution.
- [x] 1.2 Extend state loading with matching legacy fallback, recoverable live `--fresh` rotation, dry-run immutability, and actionable read/schema/ownership/write errors.

## 2. CLI and migration integration

- [x] 2.1 Add and validate the `--fresh` option, make `--state` optional, and expose state selection and duplication warnings in terminal progress.
- [x] 2.2 Integrate resolved state, cache, and report roots into migration orchestration and include non-secret state metadata in results/reports.

## 3. Documentation and tests

- [x] 3.1 Document automatic state isolation/reuse, multiple migrations, legacy adoption, explicit override, fresh recovery, and failure remediation in README.
- [x] 3.2 Add unit and integration tests for canonical forms, distinct identities, legacy fallback, fresh backup, dry-run behavior, CLI validation, and error messages.

## 4. Validation and completion

- [x] 4.1 Run focused tests and `npm run check`, fixing all failures without weakening quality gates.
- [x] 4.2 Archive the OpenSpec change and run strict validation with no active changes remaining.

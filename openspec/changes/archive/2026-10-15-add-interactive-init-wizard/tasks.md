# Tasks

## 1. Public CLI and dependency

- [x] 1.1 Add the maintained `@clack/prompts` dependency and `init --interactive` command model/help, verified by dependency install, CLI parser tests, and typecheck
- [x] 1.2 Enforce the TTY-only interactive contract and cancellation exit codes, verified by CLI tests that observe no workspace mutation

## 2. Draft configuration and provider verification

- [x] 2.1 Refactor strict configuration parsing for in-memory YAML drafts and comment-preserving selected-profile edits, verified by config tests for validation, profile preservation, limits, and comments
- [x] 2.2 Add authenticated Yandex Wiki, Confluence Data Center, and Confluence Cloud current-user probes, verified by mock API tests for headers, platform requests, retries, and failure statuses
- [x] 2.3 Add secret-safe connection failure classification and connection-only verification orchestration, verified by tests for auth, forbidden, URL, rate limit, server, timeout, DNS, TLS, and redaction

## 3. Interactive wizard and persistence

- [x] 3.1 Implement the injected prompt adapter and staged wizard state machine, verified by scripted-prompt tests for defaults, required fields, Back/Continue, retained secrets, Cloud/IAM branches, retry, and cancellation
- [x] 3.2 Implement existing-workspace edit/reset/exit behavior and transactional persistence, verified by filesystem tests for untouched exit/failure, profile/comment preservation, secure backup, permissions, state preservation, conflict detection, atomic replacement, and rollback
- [x] 3.3 Integrate wizard output and first dry-run guidance into `init`, verified by CLI integration tests with no secret disclosure and no remote writes beyond probes

## 4. Documentation and package acceptance

- [x] 4.1 Update only the existing README sections for guided and automation setup, parameters, verification boundary, and frequent examples, verified by documentation assertions and heading-order checks
- [x] 4.2 Extend package validation for interactive help and non-TTY rejection, verified by isolated tarball installation without workspace or network mutation

## 5. Integrated verification

- [x] 5.1 Run `npm run check`, resolve all findings without weakening gates, and verify the complete suite succeeds

## Workflow follow-up

- Archive `add-interactive-init-wizard` and run strict post-archive validation.
- Commit as `feat(init): add interactive setup wizard`, push `master`, and publish SemVer 3.1.0 through Release Please, npm, GitHub Release, and Homebrew.

# Tasks

## 1. Documentation architecture

- [x] 1.1 Rewrite `README.md` into the nine specified task-oriented sections and verify its H2 order plus quick-start commands match the delta specification.
- [x] 1.2 Audit the rewritten README against current CLI help and `ywtc.config.example.yaml`; verify every command, alias, default, provider profile field, compatibility boundary, and authentication mode remains accurate.
- [x] 1.3 Reconcile capabilities, limitations, state semantics, reports, and statuses into canonical non-duplicated tables or prose; verify every documentation scenario in the delta spec is represented once.

## 2. Documentation contract checks

- [x] 2.1 Update `scripts/release-check.mjs` for the new information architecture and essential operator paths; verify focused release tests reject missing quick-start or common-example content without enforcing obsolete checklist syntax.
- [x] 2.2 Compare README size and repeated phrases with the previous document; verify the result is materially shorter and contains no duplicated status/configuration/state definitions.

## 3. Integration verification

- [x] 3.1 Run strict validation for `simplify-readme-information-architecture` and verify proposal, design, specifications, and completed tasks remain consistent.
- [x] 3.2 Run `npm run check` and verify release hygiene, tests, browser checks, package validation, build, and OpenSpec validation all pass without modifying tracked artifacts.

## Workflow follow-up

- Archive the change after every tracked task passes.
- Run strict OpenSpec validation against the archived main specifications.

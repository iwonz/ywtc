# Tasks

## 1. Personal-space operator workflow

- [x] 1.1 Add the dedicated README subsection with prerequisites, exact personal source forms, existing destination-parent semantics, and copyable dry-run/live `subtree` commands for both directions; verify every documented flag and locator against CLI and adapter source.
- [x] 1.2 Extend `scripts/readme-contract.mjs` and its Vitest coverage to require the subsection and both directional command pairs while retaining exactly four general examples; verify with `npx vitest run tests/readme-contract.test.ts`.

## 2. Integration verification

- [x] 2.1 Update only the locked transitive `follow-redirects` resolution from the vulnerable 1.16.1 release to 1.16.3 within the existing `axios` range; inspect the lockfile diff and verify `npm audit --omit=dev --audit-level=high` succeeds through the official registry.
- [x] 2.2 Run `npm run check` and verify the complete repository quality gate succeeds without weakening checks or adding ignores.

## Workflow follow-up

- Archive `document-personal-space-migration` after all tracked tasks pass so the delta updates the current `project-maintenance` specification.
- Run `npm run spec:validate`, confirm no active change remains, and compare `origin/master` with base `ce17ca57542787eebfa400d1a2a391ff9befffae` before any commit or push.

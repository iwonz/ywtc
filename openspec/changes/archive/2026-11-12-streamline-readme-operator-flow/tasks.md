# Tasks

## 1. README contract guardrails

- [x] 1.1 Add focused tests for the 6,500-word ceiling and required scenario-selector entries, and verify the new tests fail against an intentionally oversized or incomplete README.
- [x] 1.2 Implement the validator checks in `scripts/readme-contract.mjs` and verify `npm test -- --run tests/readme-contract.test.ts` passes.

## 2. Scenario-oriented operator guide

- [x] 2.1 Rewrite the entry, capability, compatibility, configuration, and CLI material as a progressive scenario-oriented path; verify documented commands, options, fields, defaults, personal-space examples, and safety claims against source and current specs.
- [x] 2.2 Consolidate export, state, resume/retry/sync, reporting, status, and contributor guidance without losing unique conditions or operator actions; verify all nine required sections remain ordered and the README contains no more than 6,500 words.
- [x] 2.3 Run the focused README contract tests and review the rendered Markdown structure for valid headings, tables, code blocks, and anchors.

## 3. Integration verification

- [x] 3.1 Run `npx openspec validate streamline-readme-operator-flow --strict --no-interactive` and `npm run check`, fixing any failures without weakening checks.

## Workflow follow-up

- Archive the completed change so its delta is synchronized into the current specifications.
- Run `npm run spec:validate` and confirm no unfinished active change remains.

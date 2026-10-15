# Tasks

## 1. README information architecture

- [x] 1.1 Rewrite README with exactly the thirteen specified H2 sections in order, remove the v2 transition and one-time bootstrap material, and verify the heading list contains no extra H2 sections.
- [x] 1.2 Consolidate workspace/profile concepts under Configuration and document all current commands, CLI options, profile fields, secret variables, locators, and scope semantics; verify the reference matches `src/cli-arguments.ts` and `src/config.ts`.
- [x] 1.3 Separate State and Reports, preserve rerun/conflict/interruption/report behavior without repetition, and verify common examples still cover every remote direction, both export formats, custom workdir, fresh runs, and page/linked scopes.

## 2. Documentation guard

- [x] 2.1 Add an exact README H2-order assertion to the repository hygiene check and verify `npm run release:check` accepts the new document.

## 3. Integration validation

- [x] 3.1 Run `npm run check` on Node.js 26 and verify every quality gate passes without rewriting tracked files.

## Workflow follow-up

- Archive `streamline-readme-information-architecture` after all tracked tasks pass.
- Run strict validation against the archived OpenSpec content.

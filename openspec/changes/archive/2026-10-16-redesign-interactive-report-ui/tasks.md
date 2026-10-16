# Tasks

## 1. Report model and shell

- [x] 1.1 Add the React/Vite/Tailwind/shadcn report application, single-file build, shared contracts, and package scripts; verify UI and Node typechecks plus a shell-marker unit test pass.
- [x] 1.2 Extend report pages, resources, comments, exclusions, and issues with provider-neutral hierarchy and diagnostic metadata; verify unit tests reconcile every source object to one outcome without exposing preview bodies.
- [x] 1.3 Replace legacy string rendering with atomic injection into the compiled offline shell; verify generated HTML works through `file://`, downloadable JSON remains sanitized, and application startup performs no network requests.

## 2. Dashboard experience

- [x] 2.1 Implement the localized source-versus-destination summary, run context, status presentation, and theme/language controls; verify RU/EN and system/light/dark browser tests on desktop and mobile.
- [x] 2.2 Implement the initially expanded virtualized hierarchy, branch controls, search, problem filters, excluded/unknown-position nodes, source/destination links, and keyboard semantics; verify unit and Playwright coverage including a 10,000-node fixture.
- [x] 2.3 Implement the accessible tabbed page dialog for overview, files, comments, comparison, and causal issues; verify exact resource/comment failures, grouped blocked dependencies, sandboxed actual previews, focus trapping, and Escape behavior.

## 3. Illustration, packaging, and documentation

- [x] 3.1 Generate and visually inspect the transparent provider-neutral report header without modifying the README header; verify alpha, light/dark readability, desktop/mobile fit, and absence of organization-specific data.
- [x] 3.2 Extend browser, security, visual, and package smoke checks for the compiled shell and asset; verify package installation can generate a complete autonomous report without repository source files.
- [x] 3.3 Update only the existing README Reports section with concise dashboard guidance and verify the fixed thirteen-heading structure and release hygiene checks remain valid.

## 4. Integration verification

- [x] 4.1 Run targeted report unit/browser/package checks and resolve accounting, accessibility, privacy, responsive-layout, or packaging failures.
- [x] 4.2 Run `npm run check` and strict OpenSpec validation, fixing failures without weakening gates or adding broad ignores.

## Workflow follow-up

- Archive the change after every tracked task is complete so delta specifications synchronize into the main specifications.
- Run strict validation after archival, compare `master` with `origin/master`, create `feat(reports): add interactive migration dashboard`, push, and complete the existing Release Please publication flow for `3.5.0`.

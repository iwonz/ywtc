# Tasks

## 1. Source-derived remote content

- [x] 1.1 Add typed uploaded/source-fallback resource bindings, bootstrap rendering, and semantic content inspection; verify focused renderer tests cover both providers, internal links, images, attachments, unsupported content, and raw fallback
- [x] 1.2 Refactor remote migration to pre-render source-derived bodies, create pages with bootstrap content, isolate resource/snapshot failures, and always attempt final content refinement; verify regression tests cover upload/download/update failures without placeholder creation
- [x] 1.3 Add exact generated-placeholder recovery and actual destination semantic verification without weakening manual conflict detection; verify resume tests cover repair, conflicts, empty/truncated content, and no duplicate pages
- [x] 1.4 Extend state/report progress and actual previews for partial resource fallbacks; verify state and report tests expose actionable resource errors without secrets

## 2. Report access CLI

- [x] 2.1 Add the cross-platform opener dependency and a safe report catalog with injected opener; verify unit tests cover sorting, malformed bundles, latest/explicit selection, missing reports, and traversal rejection
- [x] 2.2 Add `reports list`, `reports open [run-id]`, `migrate --open-report`, file URLs, and typed report-producing failures; verify CLI tests cover help, parsing, output, opener failure, and migration exit-code preservation

## 3. Guided handoff and documentation

- [x] 3.1 Simplify the wizard first dry-run command and verify tests cover default, discoverable, and custom workdirs without redundant profile or scope flags
- [x] 3.2 Update only the existing README sections for content guarantees, parameters, examples, state, and reports; verify heading order and documented commands through repository checks

## 4. Integration and quality

- [x] 4.1 Run focused and full test matrices for all remote directions, dry-run, partial resource retry, reports, package smoke tests, and browser report rendering; verify `npm run check` passes
- [x] 4.2 Complete task checkboxes and validate the active change strictly before archival

## Workflow follow-up

- Archive `guarantee-content-and-report-access`, run strict validation against all specifications, and confirm no active changes remain.
- Fetch and compare `origin/master`, commit with a release-producing Conventional Commit, push without force, and verify the Release Please proposal for `3.2.0`.
- After release merge, verify GitHub Release, npm/npx, and Homebrew publication.

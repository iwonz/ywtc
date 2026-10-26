# Tasks

## 1. Decision contract and source scanner

- [x] 1.1 Add strict browser-safe decision JSON and source identity matching; verify unit tests for duplicates, defaults, URL safety, inventory and metadata.
- [x] 1.2 Replace active config modes and pin a source-bound mapping snapshot before API requests; verify path/config/preflight tests and update configuration reference.
- [x] 1.3 Share bounded page/comment/inline-context scanning without vendor rendering; verify exclusion, Unicode, malformed identity and megabyte fixtures.

## 2. Migration and historical data

- [x] 2.1 Remove destination lookup, aliases and native/template processing while keeping historical state/report values readable; verify adapter/type/state tests and current status documentation.
- [x] 2.2 Integrate preserved/linked presentation and per-object effective fingerprints into pages, comments and filesystem output; verify all directions, decision-only reruns and comment revisions without changing state identity.
- [x] 2.3 Exclude retired lookup warnings from retry selection; verify complete-object retry regressions and update retry guidance.

## 3. Mention-only CLI export

- [x] 3.1 Add source-only discovery and page/comment scanning with exact occurrence aggregation and partial inventory; verify scope/status/pagination/failure/cancellation/no-resource/no-destination tests.
- [x] 3.2 Add CLI aliases, read-only workspace selection, safe staged non-overwriting publication and summary paths; verify CLI/filesystem tests and document command usage.

## 4. Autonomous editor and package

- [x] 4.1 Build Mantine singlefile editor with validation, import, download, delete/undo, search/filter, contexts, themes, keyboard and virtualization; verify editor model and file-URL browser tests.
- [x] 4.2 Integrate bundled assets into build and installed-package smoke tests; verify tarball export and editor-generated JSON acceptance without external requests.
- [x] 4.3 Complete canonical README/agent instruction consistency and current specification coverage; verify nine-section/status contracts and no migration-specific data.

## 5. Integration acceptance

- [x] 5.1 Run full npm run check, browser/package smoke tests and strict change validation; fix all failures without weakening checks.

## Workflow follow-up

- Archive the completed change, run strict all-spec validation, and confirm no unfinished active changes.
- Recheck origin/master against eb6929ff891412c79348d648075943ac01d478e0 before committing and pushing.
- Validate the full breaking commit message and actual new commit range. Push without force.
- Verify Release Please proposes 5.0.0 with metadata-only changes; publish and verify GitHub, npm/npx, and Homebrew channels.
- Do not rerun or mutate any existing real migration or populated workspace configuration.

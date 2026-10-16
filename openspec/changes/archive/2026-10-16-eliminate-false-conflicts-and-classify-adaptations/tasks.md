# Tasks

## 1. Transformation impact and verification

- [x] 1.1 Add typed normalization/adaptation/degradation notices to normalized and rendered content contracts; verify typecheck and focused content-model tests.
- [x] 1.2 Classify Grid snapshots, external images, tabs, layouts, media, formulas, macros, raw fallbacks, and managed-resource fallbacks by information impact; verify golden unit tests for complete versus partial outcomes.
- [x] 1.3 Extend provider-aware verification for Grid cells and preserved external-image attributes; verify tests reject omitted information while accepting complete adaptations.
- [x] 1.4 Update migration and filesystem status calculation so adaptations do not produce partial or completed-with-warnings; verify remote and export integration tests.

## 2. Typed identity and collision handling

- [x] 2.1 Replace message-based conflict detection and issue categorization with typed ownership evidence and stable code mappings; verify ordinary `409`, title, duplicate, and message-text cases never become conflict.
- [x] 2.2 Repair mapped state from immutable destination IDs, validate duplicate destination mappings, and handle mapped title collisions without blocking valid content updates; verify resume and hierarchy tests.
- [x] 2.3 Reconcile source locator/status/ancestry drift by immutable ID while retaining real inventory contract failures; verify Yandex pagination, rename, move, and exclusion tests.
- [x] 2.4 Implement repeated refresh/hash/name resource reconciliation for ordinary, snapshot, and comment archive attachments including append-only Yandex behavior; verify collision and ambiguous-response tests.
- [x] 2.5 Reconcile comment revision and duplicate archive candidates without false conflict; verify Confluence/Yandex comment resume tests.

## 3. Local concurrency and atomic ownership

- [x] 3.1 Add exclusive live-state leases with signal cleanup and safe same-host stale recovery; verify concurrent live, stale, and dry-run tests.
- [x] 3.2 Add filesystem export promotion leases and accept existing empty directories while preserving unmanaged non-empty output; verify transactional export tests.
- [x] 3.3 Implement semantic three-way YAML merge for wizard edits while retaining whole-document reset protection; verify comments, formatting, non-overlap, overlap, and rollback tests.

## 4. Reporting and documentation

- [x] 4.1 Extend state, report contracts, catalog, CLI summary, and report UI with adaptation, preserved-external-reference, and ownership-evidence data; verify cross-surface totals and browser interactions.
- [x] 4.2 Update README supported-content, State, and Reports text within the fixed heading structure; verify documentation and release-hygiene tests.

## 5. Integration verification

- [x] 5.1 Run focused migration, resource, comment, state, filesystem, wizard, report, and browser suites and fix regressions.
- [x] 5.2 Run `npm run check`, package smoke checks, and strict OpenSpec validation with every tracked task complete.

## Workflow follow-up

- Archive the validated change and rerun strict specification validation.
- Fetch and compare `origin/master`, then create `fix(migration): distinguish adaptations from incomplete transfers` and push without force.
- Verify Release Please calculates `4.0.1`, then verify GitHub, npm/npx, and Homebrew publication.

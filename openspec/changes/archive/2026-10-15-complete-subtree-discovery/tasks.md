## 1. Complete source discovery

- [x] 1.1 Add the provider-neutral `sourceStatus` contract to CLI arguments, adapter capabilities, run state, and reports without changing canonical state identity; verify parser, help, validation, and resume tests.
- [x] 1.2 Remove the unconditional Yandex actuality filter, implement `all`/`current` selection with guarded cursor pagination and complete detail hydration, and add Confluence status semantics; verify client and adapter contract tests.
- [x] 1.3 Preserve full source ancestry, enforce unique/contained/placed graph invariants, choose the nearest selected ancestor, and record exclusions and hierarchy gaps; verify multi-level, obsolete-parent, duplicate, cursor-cycle, and hydration-failure tests.

## 2. Destination hierarchy reconciliation

- [x] 2.1 Add safe page-reparent capability to Confluence Data Center and Cloud clients/adapters using `ancestors` and `parentId`, with a read-back parent check; verify request-body and adapter contract tests.
- [x] 2.2 Compare saved destination parents during top-down staging, preserve conflict protection, move safe pages, and recreate under the correct parent when move is unsupported without deleting the old page; verify resume, conflict, blocked-descendant, and attachment-mapping tests.

## 3. Diagnostics and documentation

- [x] 3.1 Derive terminal inventory, state counters, HTML/JSON report data, and report catalog counts from one selection summary including status, returned/selected/excluded pages, maximum depth, gaps, and hierarchy repairs; verify report and browser tests.
- [x] 3.2 Document `--source-status`, complete subtree semantics, state reuse, and report fields in the existing README sections only; verify documentation and packaged-help checks.

## 4. Integration and delivery verification

- [x] 4.1 Exercise all source-status/scope combinations, dry-run mutation safety, expansion of an existing state, and hierarchy repair in integration tests; run `npm run check` and package/browser smoke tests.

## Workflow follow-up

- Archive `complete-subtree-discovery`, run strict OpenSpec validation again, commit with `feat(migration): discover complete source subtrees`, and publish through the existing Release Please workflow.
- Keep runtime state, reports, cache, credentials, internal domains, and source content out of Git and package artifacts.

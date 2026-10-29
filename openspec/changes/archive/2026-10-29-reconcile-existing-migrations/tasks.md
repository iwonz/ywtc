# Tasks

## 1. Evidence and review contracts

- [x] 1.1 Add strict sync plan/decision contracts, canonical content hashes and optional state evidence/Keep/exclusion metadata; verify backward-readable state and decision validation tests.
- [x] 1.2 Add CLI sync analysis/apply parsing and explicit trash confirmation; verify UUID/options/help/exit-code tests and update canonical command guidance.

## 2. Scoped incremental execution

- [x] 2.1 Implement restored identity, expanded subtree/space discovery and independent body/resource/comment classification; verify access expansion, unknown baseline, unchanged version and Keep expiry fixtures.
- [x] 2.2 Extend shared core execution with pre-run and under-lease completion hooks, immutable snapshots and owned checkpoints; verify stale previews, stable IDs, no unnecessary PUT and interruption/lost-response recovery.
- [x] 2.3 Preserve operator-trash exclusions in migrate/retry without implicit recovery; verify excluded-parent handling, totals and status documentation.

## 3. References and providers

- [x] 3.1 Implement rebuildable mapped reference indexing and protected structural page/comment patches; verify aliases, fragments, kept pages, literal decisions and ambiguous references.
- [x] 3.2 Implement proved Confluence native ID/title normalization and storage-only verification reads; verify Data Center/Cloud contracts reject lost links, labels and differing spaces.
- [x] 3.3 Add conservative reversible leaf-trash capability and read-back reconciliation; verify drafts/children/unknown evidence, explicit confirmation, permissions and no purge or child deletion, and update contributor safety instructions.
- [x] 3.4 Implement managed Markdown/HTML expansion retaining paths and reused payloads; verify navigation, link repairs, ZIP and atomic replacement/stale-output fixtures.

## 4. Shared operator workflows

- [x] 4.1 Wire sync operations into durable jobs, progress and aggregate report/catalog metadata; verify shared CLI/UI lifecycle, outcome provenance and consistent totals.
- [x] 4.2 Add Mantine synchronization review with filtering, diff, revision-checked decisions and explicit apply/trash confirmation; verify Playwright themes/mobile/keyboard and stale-tab behavior.
- [x] 4.3 Complete canonical README command, state and numbered status conditions within its nine sections; verify readme/privacy contracts.

## 5. Integration validation

- [x] 5.1 Add installed-package sync smoke coverage and run relevant unit/contract/browser/package tests, including large and hostile inputs.
- [x] 5.2 Run `npm run check` and strict OpenSpec validation; fix failures and verify all tracked tasks are complete.

Verification: 602 unit/contract tests and 17 Playwright scenarios passed; build, isolated installed-package synchronization smoke, privacy/readme checks and strict OpenSpec validation passed. Additional lost-response reconciliation fixture passed. Real provider mutations were not used for generic synchronization tests.

## Workflow follow-up

- Archive the completed change, validate all specifications strictly and confirm no active unfinished change remains.
- Fetch and compare the recorded master base before commit and push; validate the full Conventional Commit and actual range.
- Publish through Release Please and verify the supported release channels; never include private recovery data or run real trash operations for testing.

# Tasks

## 1. Yandex page contract and Grid recovery

- [x] 1.1 Accept explicit null content only for valid Yandex Grid page details, carry provider-unavailable content metadata in the normalized source page, and verify client/adapter contract tests reject missing ordinary page content
- [x] 1.2 Reconcile provider-unavailable Grid content with Grid resources, producing either a verified static-table adaptation or a source-link degradation, and verify content-model plus migration tests cover both outcomes and semantic-empty separation

## 2. Incomplete discovery diagnostics

- [x] 2.1 Add a typed incomplete-discovery result with enumerated identities, hydrated pages, exclusions, per-page redacted failures, and typed retryability; verify adapter tests cover mixed success, schema failure, and retryable transport failure
- [x] 2.2 Handle typed discovery failure before destination mutation, reconcile report page/count/outcome invariants, keep comments not-started, and emit a bounded terminal summary; verify migration/report tests prove zero destination mutations and structured per-page issues

## 3. Documentation and integration verification

- [x] 3.1 Update the existing README content-fidelity/limitations tables only where needed to describe unavailable provider-managed payload fallback, and verify commands and status language remain current
- [x] 3.2 Run focused tests, `npm run check`, package smoke checks, and strict OpenSpec validation; fix every failure without weakening validation

## Workflow follow-up

- Archive the change after all tracked tasks pass.
- Run `npm run spec:validate`, confirm no active change remains, then follow the repository's conventional commit and release workflow.

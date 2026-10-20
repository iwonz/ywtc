# Proposal

## Why

Yandex Wiki legitimately returns some Grid page details with `content: null`, but ywtc currently treats that provider representation as a schema failure and aborts the entire subtree before any page can be transferred. Large discovery failures also collapse all affected pages into one duplicated diagnostic and lose the descendant inventory counts needed to understand what failed.

## What Changes

- Accept the provider's explicit null body for Yandex Grid pages while keeping identity, hierarchy, and ordinary page-body validation strict.
- Recover Grid data through the resource API when available; otherwise transfer an explicit readable source-reference fallback and mark only that page partial.
- Keep semantically empty ordinary pages distinct from provider-unavailable Grid payloads.
- Preserve known descendant identities and outcomes when detail hydration is genuinely incomplete, with structured per-page issues, truthful retryability, and compact terminal diagnostics.
- Continue to stop before destination mutation when real page-detail failures make inventory incomplete.
- Do not delete, overwrite, or infer unavailable source data, and do not weaken dry-run or destination safety boundaries.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `wiki-migration`: distinguish valid provider-null Grid content from invalid page details, provide a loss-aware fallback for unavailable Grid payloads, and retain truthful inventory diagnostics on discovery failure.

## Impact

- Yandex Wiki response validation and source adapter normalization.
- Provider-neutral source-page/content metadata and Grid rendering.
- Migration discovery failure handling, report inventory, issue collection, and terminal error summaries.
- Unit, contract, migration, and report tests for null Grid bodies and partial discovery.
- No CLI option, state identity, external dependency, or destructive-operation change.

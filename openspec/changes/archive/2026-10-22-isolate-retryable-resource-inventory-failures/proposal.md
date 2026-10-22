# Proposal

## Why

Large source trees currently treat every Grid payload read as a mandatory page-inventory dependency. One transient Grid `5xx` can therefore discard the otherwise valid inventory outcome for its page and prevent every destination mutation across thousands of unrelated pages, even though the page body, hierarchy, Grid identity, and a safe source fallback remain available.

## What Changes

- Split source inventory into mandatory page topology/body collection and independently checkpointed resource enrichments.
- Represent each discovered Grid even when its payload read is exhausted, retaining typed retry evidence and a source-safe fallback instead of failing the whole page inventory.
- Allow destination transfer after the structural inventory barrier when only recoverable resource enrichments are unavailable; affected pages remain readable and `partial`, while unrelated pages continue.
- Retry only failed Grid resources and rerender their owning pages after recovery, reusing successful page, resource, and comment checkpoints.
- Improve terminal and report diagnostics to distinguish topology, page bodies, Grid summaries, Grid payloads, and their exact outcomes.
- Print the canonical `ywtc retry <run-id>` continuation after an actionable failed live migration.
- Preserve strict no-mutation behavior for incomplete hierarchy, immutable identity, ordinary page content, destination preflight, and unsafe filesystem ownership.
- Do not delete or silently omit source/destination data, and do not mark a page complete while a referenced Grid payload remains unavailable.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `resumable-source-inventory`: make resource enrichment outcomes independently durable and non-blocking when a complete readable fallback exists.
- `targeted-run-retry`: select failed Grid resources and their owning page render without reprocessing resolved siblings.
- `wiki-migration`: narrow the global preflight barrier to structural and required-content failures while preserving truthful partial outcomes for isolated resource failures.

## Impact

- Source adapters and the provider-neutral resource model gain typed inventory outcomes for independently fetched resources.
- Inventory checkpoints, migration orchestration, retry planning, reports, terminal summaries, and README behavior change.
- Existing canonical state identity and CLI options remain unchanged; no source or destination object is deleted.
- Unit, contract, integration, retry, report, package, and OpenSpec validation cover the new failure boundary.

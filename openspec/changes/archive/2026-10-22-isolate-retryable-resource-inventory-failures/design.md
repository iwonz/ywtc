# Design

## Context

See `proposal.md` for motivation. The current Yandex adapter materializes every Grid payload inside `listResources`, and the migrator treats any thrown resource-read error as a failed page checkpoint. The global source-inventory barrier then correctly prevents mutation for an incomplete page, but cannot distinguish an unknown resource collection from one known Grid whose independent payload is temporarily unavailable.

The existing HTTP layer already performs five bounded safe-method attempts, honors `Retry-After`, and the inventory layer performs reduced-concurrency recovery waves. Additional blind retries would increase elapsed time without correcting the dependency classification.

## Goals / Non-Goals

**Goals:**

- Preserve the strict barrier for incomplete topology, page identity/body, and resource enumeration.
- Make an enumerated Grid payload an independently checkpointed, reported, and retryable enrichment.
- Continue the transfer with full ordinary page content and an explicit source fallback when a Grid payload remains unavailable.
- Allow `retry` to refresh the failed Grid and rerender only its owning page while carrying forward successful siblings.
- Keep file counts distinct from Grid outcomes and make terminal/report diagnostics explain both layers.

**Non-Goals:**

- Treat missing Grid data as complete or as an information-preserving adaptation.
- Download external resources, infer unenumerated Grid identity, or bypass provider permissions.
- Relax the barrier for failed descendant enumeration, page details, attachment lists, Grid lists, or invalid ordinary page bodies.
- Add a CLI flag, state identity input, destructive cleanup, or provider write endpoint.

## Decisions

### Store a typed resource payload outcome on the normalized resource

`SourceResource` gains an optional serializable inventory failure containing operation, stable code, retryability, safe message, status, attempt count, endpoint, and source fallback URL. A resource without that field is complete for inventory purposes. The field is accepted by the current passthrough checkpoint schema, so existing checkpoints remain readable without conversion.

Alternative: keep Grid failures only in a page-level error map. Rejected because retry selection, report identity, and per-resource checkpoint reuse would remain impossible.

### Separate enumeration from Grid payload reads

The Yandex adapter continues to fail the required inventory when attachment or Grid enumeration fails. Once Grid summaries are available, it creates one resource for every immutable Grid ID and settles each payload request independently. Failed payloads return typed resource outcomes rather than rejecting the page resource collection.

An optional adapter operation refreshes one already enumerated resource. Yandex implements it for Grid payloads; providers without independently readable resources do not expose it. Recovery waves invoke this operation only for failed Grid IDs and replace successful outcomes in place.

Alternative: rerun `listResources` for the page. Rejected because it repeats successful Grid payload requests and cannot satisfy object-granular retry.

### Keep core page checkpoints usable with failed enrichments

A page checkpoint is complete when topology, ordinary body, resource enumeration, normalization, and comment policy are known, even if an identified Grid payload has a typed failed outcome. The checkpoint stores both successful and failed Grid records. Compatible reruns reuse the core page and successful resource payloads, then schedule only retryable failed enrichments.

The manifest remains `collecting` only for barrier-blocking failures. A run may mark it ready and enter destination mutation with failed enrichment records because every resource has an explicit outcome and fallback.

### Render failed Grids as explicit degradations

Grid rendering partitions complete and failed resources. Complete payloads become static-table adaptations. Failed payloads become visible fallback blocks containing the Grid title, safe failure summary, and absolute source-page link. The fallback retains the Grid immutable ID in normalized metadata for report and retry correlation. It never becomes an attachment reference or an empty table.

The owning page is `partial`, not `failed`, when its ordinary body verifies and every unavailable Grid has that fallback. A successful later read removes the fallback, produces the static table, and permits `complete + adaptation` after destination verification.

### Report Grids as resources without inflating file totals

Report resource items allow `kind: grid`, with `complete` or `failed` inventory outcomes and typed source identity. File totals and bytes continue to count only attachments, images, and comment attachments. Grid totals expose discovered, complete, and failed payloads separately. Grid issues use the resource ID and name, so one provider error is one root issue rather than a failed page inventory.

The summary keeps `inventoryComplete=true` when the barrier is satisfied and exposes a separate enrichment-failure count. Reports and terminal output show topology/page inventory separately from Grid payload outcomes.

### Reuse retry's resource-only path

The retry planner already selects failed resources from typed issues. Including Grid items in report resources makes the Grid the actionable root while the page is selected for rerender context. During retry, a compatible page checkpoint is loaded, only selected or still-failed Grid IDs are refreshed, and the final renderer/update runs for the owner. Unselected successful pages and Grid siblings remain carried forward.

For older reports that modeled `grid-read` as a page failure, current retry classification still selects the page and refreshes its inventory; new reports become resource-granular.

### Point failed live migrations to retry

Once a live attempt has a state-backed report Run ID, CLI failure output prints `ywtc retry <run-id> --workdir ...`. Dry-runs retain a `migrate` continuation because they are not valid retry roots. This removes copied locators and directs operators to checkpoint-aware continuation.

## Risks / Trade-offs

- **A Grid changes while its successful cached payload is reused** → Page revision changes invalidate the page checkpoint; selected targeted retries deliberately refresh only actionable resources, matching retry's frozen-graph contract.
- **A failed Grid has no dedicated public web URL** → Use the canonical owning page URL and label the Grid by immutable ID/title; never invent an unauthenticated download URL.
- **Provider returns a permanent `4xx` for one Grid** → Preserve the fallback as a terminal degradation; do not retry it indefinitely or mark it complete.
- **Report resource aggregation starts including Grids** → Filter file/byte totals by resource kind and add invariant tests so Grid rows cannot inflate attachment metrics.
- **An old checkpoint lacks typed resource outcomes** → Treat its existing Grid payloads as complete; ordinary page fingerprint and fresh enumeration rules remain unchanged.

## Migration Plan

1. Add optional typed resource inventory evidence and single-resource refresh support without changing existing state identity or checkpoint compatibility.
2. Update Yandex Grid collection, inventory recovery, rendering, report aggregation, retry selection, and continuation output.
3. Add contract/integration tests for multiple Grids, one exhausted `504`, successful unrelated transfer, targeted recovery, persistent partial outcome, and strict structural failures.
4. Publish as a patch release. Rollback is the preceding package; destination history retains any page versions created by the resilient run.

# Design

## Context

See `proposal.md` for motivation. Current reruns are idempotent but execute the whole selected graph. Reports hold per-run typed outcomes and issues, while state holds the latest cumulative mappings. Retry therefore needs immutable report evidence for selection, current state for safe identity/mapping recovery, and the ordinary transfer pipeline for mutations.

## Goals / Non-Goals

**Goals:**

- Repeatedly continue one migration lineage from any member Run ID.
- Avoid source-body reads and destination writes for successful independent pages.
- Preserve top-down hierarchy, object-granular recovery, dry-run safety, report truthfulness, and atomic exports.
- Support current pre-feature reports when their existing fields prove every required input.

**Non-Goals:**

- Synchronize successful pages that changed after the baseline retry report.
- Retry permanent degradation or ambiguous ownership automatically.
- Delete or consolidate earlier destination objects, reports, state, exports, or archives.
- Add a schema version, state identity input, provider endpoint, or credential source.

## Decisions

### Add a dedicated command backed by the existing runner

`retry` resolves workspace and local evidence before constructing the same validated locator/options shape used by `migrate`. A retry block on `TransferOptions` carries the plan and baseline report into `Migrator`; provider clients and mutation implementations remain shared. This avoids a second migration implementation while allowing transfer loops and the exporter to filter work.

Alternative: translate retry directly into an ordinary full `migrate`. Rejected because it cannot avoid successful page reads or distinguish carried-forward outcomes.

### Store an explicit safe invocation and reconstruct current reports

New reports include a credential-free invocation containing locator/profile and behavior flags. A loader validates the full current report contract and can reconstruct the same information from the existing source, destination, state, and output fields. Reconstruction fails closed when an input such as filesystem format or archive policy cannot be proven.

Alternative: derive everything from state. Rejected because state intentionally omits invocation flags and per-run outcomes.

### Resolve lineage under the state lease

Every live retry run records root, parent, and attempt metadata. Once the selected state is locked, retry resolution chooses the latest terminal non-dry-run member for the root. Dry-run retry reports point at the lineage but never become its live head. A retry of any child resolves to the same root.

Alternative: always replay the explicitly selected report. Rejected because fixed objects would be selected repeatedly.

### Build an object-level plan from typed evidence

A pure planner consumes the baseline report and produces page/resource/comment decisions plus reasons. Incomplete outcomes require matching unresolved retryable issue evidence, except `not-started`, which is actionable by lifecycle definition. Blocked objects follow their root cause. Complete outcomes, information-preserving notices, permanent failures, and ownership conflicts are not selected. A code-keyed current retry-policy registry may upgrade older issue classification without parsing messages.

The plan carries full-page mutations separately from resource-only and comment-only work. Structural ancestors become context. Causally blocked descendants become selected. At runtime a missing context mapping is promoted to a recovery dependency.

Alternative: select every non-complete status. Rejected because deterministic degradations and true conflicts would never converge.

### Freeze membership and refresh only selected source payloads

The baseline live report supplies graph membership and hierarchy. Selected pages are resolved by immutable source identity, their current content plus resource/comment inventory is refreshed, and verified binary cache entries remain reusable when provider metadata is unchanged. Context ancestors use page identity and mapping reads without body reconciliation. Incomplete baseline discovery is the sole case that resumes full graph discovery and may add newly discovered pages.

Alternative: rediscover every successful linked page. Rejected because it defeats targeted retry and can silently expand a historical retry.

### Produce an aggregate report by overlay

The new report begins from a sanitized copy of the latest live baseline. Selected outcomes and their issues are removed and replaced by fresh results; untouched outcomes retain `attemptedInRun: false` and `outcomeRunId`. Fresh results use the new Run ID. Summary fields are recomputed from the aggregate, while a retry summary exposes attempt-only counts.

No-action evaluation happens before API preflight. A complete lineage returns `0`; terminal-only work returns `1`; both reuse the latest report and create no duplicate run. An attempted retry follows ordinary report and signal behavior.

Alternative: report only attempted objects. Rejected because operators could not tell whether the whole migration was now complete.

### Patch static exports only from a verified managed baseline

When a matching managed export exists, the exporter copies it into adjacent staging, patches selected payloads, rebuilds global navigation/manifest/archive artifacts as required, verifies every local reference, and uses the current atomic promotion flow. Without a usable baseline, it explicitly falls back to a full rebuild because report metadata cannot recreate successful files safely.

Alternative: edit the live export in place. Rejected because interruption would expose a mixed or broken site.

## Risks / Trade-offs

- **A baseline report may be locally edited or incomplete** → Strict validation, containment checks, identity matching, and fail-closed reconstruction run before provider access.
- **A successful context parent may disappear after the baseline** → Promote it to recovery work under the same state-authoritative mapping policy before processing descendants.
- **Source changes can introduce new resources on a selected page** → Refresh the selected page and include unmapped or changed referenced resources while leaving independent complete pages alone.
- **Aggregate overlay can retain stale issue counts** → Recompute issues and every summary from object outcomes after replacing all issues attached to attempted objects.
- **Filesystem patching may cost nearly a rebuild for HTML navigation** → Reuse payloads and cached resources, but permit deterministic shell regeneration; fall back to a declared full rebuild when safety requires it.
- **Persistent transient failures remain retryable indefinitely** → Preserve retryability and attempt history rather than falsely declaring data loss permanent; the operator decides when to stop.

## Migration Plan

1. Add optional invocation, provenance, and retry metadata to current report/state structures; existing current state remains valid and state IDs remain unchanged.
2. Introduce the loader, lineage resolver, planner, CLI command, and aggregate reporting without changing ordinary migrate selection.
3. Add filtered remote execution and managed export patching behind an explicit retry plan.
4. Verify package behavior and publish as a minor release. Rollback is the previous package version; created destination versions remain non-destructively available.

# Design

## Context

See `proposal.md` for motivation. The current pipeline freezes a complete graph, writes page bodies to a shared cache, then inventories resources/comments in memory. Destination safety is strong, but an inventory failure leaves no durable record connecting successful source work to the selected state. The Yandex subtree adapter also hydrates every descendant detail on every run. Runtime source data must remain ignored, owner-only, and absent from reports and package artifacts.

## Goals / Non-Goals

**Goals:**

- Continue an unfinished large-source snapshot without repeating successful page operations.
- Preserve the complete-inventory barrier before destination mutation.
- Make transient recovery selective, bounded, testable, and observable.
- Identify the exact source operation that failed without leaking request credentials or source bodies.
- Reuse one complete dry-run snapshot for the explicit live handoff.

**Non-Goals:**

- No partial destination mutation before required source inventory is complete.
- No permanent cross-run source cache after a successful live transfer.
- No new CLI/configuration controls or promise of a provider-wide atomic snapshot.
- No download of resource bytes during inventory and no deletion of source/destination objects.

## Decisions

### 1. State-associated file-per-page inventory snapshot

Add an unversioned strict inventory store below `.states/cache/inventory/<state-id>/`. A small atomic manifest identifies canonical state, root, scope, source status, comments policy, lifecycle, and run provenance. Each page uses a hashed owner-only JSON record containing its source page, source fingerprint, completed stages, resources, normalized document, and comment inventory.

File-per-page checkpoints avoid rewriting a multi-megabyte manifest thousands of times and make a successful operation durable immediately. The existing destination state remains limited to destination mappings and run history. A single monolithic state extension was rejected because source bodies/comments would make state large, sensitive, and expensive to checkpoint atomically.

### 2. Compatibility is explicit and conservative

A snapshot is reusable only for the same state ID, root immutable ID, provider/profile identity, scope, source-status filter, and comments policy, and only while its lifecycle is `collecting` or `ready`. `--fresh` creates a new snapshot generation. `completed` and `completed-with-warnings` live runs retire the generation; failed or interrupted runs retain it.

Subtree adapters reconcile the current hierarchy enumeration by immutable page ID. A new ID is fetched, an absent ID is omitted, and a changed locator refreshes that page. Retained ID/locator pairs may reuse their unfinished-snapshot details. This provides deterministic continuation rather than pretending the provider offers a globally atomic snapshot. Linked traversal can reuse completed page records once an immutable target has been resolved, while traversal still revalidates reachable references.

### 3. Inventory stages are independently typed

Inventory records advance through page detail, resource metadata, normalization, and optional comments. Provider adapters wrap failures in a typed source-operation error carrying a stable operation, optional status/code, safe endpoint path, retryability, and request-attempt count. Yandex resource discovery distinguishes attachments list, grid list, and individual grid reads; other adapters use their closest stable operation.

Free-form message matching is rejected because it previously made retryability and issue categories inaccurate. Credentials, query values, response bodies, emails, and authorization headers are never stored in the diagnostic.

### 4. Recovery waves retry only failed work

Ordinary HTTP retry remains the first layer. The migration inventory coordinator collects failures and performs three recovery waves after configurable injected delays (production defaults 5s, 15s, and 30s). Each wave queues only retryable failed stages and reduces worker concurrency toward one. `Retry-After` remains enforced inside the shared provider limiter.

Comment recovery uses the same waves but remains non-blocking after exhaustion, preserving the established partial-comment policy. Page detail, resources, grid payload, and normalization failures remain required and keep the destination barrier closed.

The alternatives of increasing global HTTP retries or restarting the entire page were rejected: they amplify healthy traffic and cannot resume after process exit.

### 5. Checkpoint payload is the input to the ordinary pipeline

Fresh and reused page records are decoded through strict runtime schemas and then populate the same `resourcesByPage`, `commentsByPage`, normalized-document cache, metrics, report pages, and destination pipeline. A malformed or incomplete record is treated as a cache miss, quarantined by generation replacement, and fetched again; it is never accepted as a successful inventory outcome.

This avoids a separate transfer path whose behavior could diverge from a normal run.

### 6. Snapshot lifecycle and cleanup

The manifest moves atomically from `collecting` to `ready` when every required page has a complete record. It remains `ready` during dry-run and destination processing. A successful live terminal status marks it `retired`; later runs create a new generation. Cache files may remain until `ywtc clean`, but retired data is ineligible for reuse.

Failed preflight, destination failure, SIGINT, and SIGTERM keep the compatible generation. This makes recovery predictable without treating old successful migrations as current source truth.

### 7. Reconciled observability

Progress reports fresh, reused, pending, recovery-wave, and remaining-failure counts. Typed issues carry the exact operation and object. Report summary fields record checkpoint reuse and recovery counts but never source bodies. A final preflight error includes inspected/total pages, remaining required failures, whether they are retryable, and confirms zero destination mutations.

## Risks / Trade-offs

- **[Source changes while a failed snapshot is resumed]** → Reconcile the immutable hierarchy set and locator drift, expose snapshot reuse in the report, retire after success, and let `--fresh` force current collection.
- **[Cache growth for thousands of pages]** → Use one hashed file per page, retain only the active generation as eligible, and rely on the existing `clean` command for physical removal.
- **[Corrupt checkpoint after interruption]** → Write temporary files with `0600`, fsync/close through normal file completion, atomically rename, and treat parse/validation failure as a cache miss.
- **[Recovery lengthens a genuinely unavailable run]** → Bound recovery to three waves and retry only typed retryable stages with decreasing concurrency.
- **[Concurrent readers/writers]** → Reuse the existing state lease for live runs and atomic generation/page writes; a dry-run uses its run generation and cannot publish a partial record as complete.

## Migration Plan

1. Ship the ignored cache structure and optional report summary fields without changing state identity or CLI syntax.
2. Existing states have no inventory manifest and therefore perform one normal inventory before gaining resumability.
3. Rollback ignores the new cache directory; destination state and mappings remain readable because their structure is unchanged.

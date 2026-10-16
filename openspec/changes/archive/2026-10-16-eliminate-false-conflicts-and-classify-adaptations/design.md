# Design

## Context

See `proposal.md`. Current migration results conflate free-form renderer warnings with information loss and infer page conflicts from error strings. State writes are atomic within one process but not leased across processes; resource reconciliation retries only one alternate name; wizard commits compare raw YAML bytes.

## Goals / Non-Goals

**Goals:**

- Make every outcome derive from typed evidence and verified information coverage.
- Reconcile deterministic provider races and mutable aliases without overwriting unmapped objects.
- Keep state, terminal, report JSON/HTML, and catalog totals identical.
- Preserve current CLI, state identity, and non-destructive guarantees.

**Non-Goals:**

- Pixel-identical rendering or preservation of executable vendor behavior.
- Downloading source-external media.
- Deleting stale destination pages, attachments, comments, exports, or state.
- Automatic resolution of genuinely ambiguous immutable ownership.

## Decisions

### Typed transformation notices replace warning-derived impact

Normalized and rendered documents carry `TransformationNotice` entries with stable code, kind (`normalization`, `adaptation`, `degradation`), message, optional object reference, and a coverage assertion. `degraded` is derived only from degradation notices. Adaptations preserve all information through a different presentation and therefore do not affect page/run completeness.

Alternative considered: maintain message allowlists. Rejected because new renderer diagnostics would silently inherit the wrong status.

### Completeness is semantic and reference-aware

Verification compares meaningful text, ordered blocks/layout cells, tables and cells, code, anchors, links, images, managed resources, macros, and comments. Grid snapshots carry expected row/cell/reference metrics. An external image is complete when the destination retains its exact absolute URL and available descriptive attributes; reachability is not probed.

### Conflict requires a typed ownership error

Only `DestinationOwnershipConflictError` can produce `conflict`. It contains a reason and candidate immutable IDs. Revision races, title collisions, missing mappings, provider failures, and diagnostic wording have distinct types. Generic HTTP 409 remains a provider error until an operation-specific adapter classifies it.

Mapped pages require only the immutable destination ID. A successful read repairs derived locator, canonical ID, title, version, and fingerprint. State is checked for duplicate page destination IDs before staging; affected branches are marked with ownership evidence while independent branches may proceed.

### Deterministic collisions use refresh-verify-allocate loops

Page titles and resource names share stable canonical-ID/hash candidates. A mapped page whose desired title is unavailable retains its verified current title after alternate allocation is exhausted, while body and hierarchy continue. New-page exhaustion is a failed allocation, not conflict.

After every ambiguous resource/archive upload, the adapter refreshes remote items, reserves all observed case-insensitive names, verifies candidate bytes by size and SHA-256 where supported, and either adopts the exact object or allocates the next name. Append-only destinations create a new hash-named mapping and preserve the old object.

### Mutable source locator drift is reconciled by immutable ID

Discovery deduplicates by provider/profile/page ID. Hydrated detail is authoritative for slug, status, and ancestry. In-subtree changes become normalizations; pages proven moved outside the root become `inventory-drift` exclusions. Repeated cursors, missing required detail, or irreconcilable immutable identity still fail inventory before mutation.

### Filesystem mutation uses leases and semantic merges

Live state and filesystem-export promotion use exclusive JSON lease files with owner PID, hostname, operation/run ID, and timestamps. Same-host leases are stale only when the recorded process is absent; uncertain remote-host leases are never stolen. Signal/finally cleanup releases owned leases. Dry-run reads atomic state without acquiring a write lease.

Wizard commit computes changed semantic YAML paths from original to draft, rereads the latest document, rejects only overlapping changes, and applies non-overlapping draft paths to the latest YAML Document. Reset intentionally touches the whole configuration and keeps raw-change protection.

### Reports use typed code mappings

Issue and transformation categories are supplied at creation or mapped from stable codes. Text regexes are removed. Report contracts add adaptation and preserved-external-reference totals; optional state page data records adaptations and ownership evidence. Existing current state remains readable because new fields are optional and no schema labels are introduced.

## Risks / Trade-offs

- [Provider diagnostics vary] → classify only recognized operation-specific payloads; unknown responses fail without alternate mutation.
- [Semantic verification may miss a new construct] → unknown coverage remains degradation until a typed verifier is added.
- [Hash verification can require downloads] → stream comparisons through cache and respect existing concurrency/rate limits.
- [Crash leaves a lease] → same-host process liveness and lease timestamps permit safe recovery; uncertain ownership requires operator action.
- [Adaptation can hide visual differences] → keep adaptations visible and inspectable without conflating them with missing data.

## Migration Plan

Implement optional state/report fields and tolerant in-memory defaults first, then switch producers and consumers together. Re-run existing states to replan prior text-derived conflicts and blocked descendants. Rollback is the prior package version; destination history and preserved objects require no data rollback.

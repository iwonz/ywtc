# Design

## Context

See `proposal.md` for motivation. Current adapters fingerprint provider title, raw body, and version, while the migrator compares that value across runs before it performs provider-aware semantic verification. Confluence can normalize storage XML or advance a version after a successful write, so valid mapped pages become false conflicts. The report application already has a sanitized contract and offline React bundle, but repeats run-level data in separate panels.

State mapping is the ownership proof. Title lookup, source-derived bootstrap matching, and recovery lookup can establish a mapping, but an arbitrary same-title destination page cannot. Provider history preserves earlier destination revisions; ywtc must never delete them or infer ownership from title alone.

## Goals / Non-Goals

**Goals:**

- Make confirmed page and comment mappings source-authoritative while keeping adoption conservative.
- Use semantic equivalence to avoid redundant writes and confirmed provider read-back to checkpoint state.
- Recover existing false conflict/blocked outcomes through the normal resume path.
- Retry only optimistic version races, with bounded fresh reads and deterministic terminal outcomes.
- Reduce report hierarchy to one overview plus the existing object tree/dialog without losing information or accessibility.

**Non-Goals:**

- Deleting or pruning destination pages, attachments, comments, or history.
- Overwriting unmapped same-title pages or resolving ambiguous identity automatically.
- Rewriting old report bundles.
- Adding CLI flags, state identity inputs, README sections, or a migration guide.

## Decisions

### Mapping proves management; fingerprints describe observations

A page/comment destination ID already stored under a canonical source ID is treated as managed unless the provider response makes that identity ambiguous. A fingerprint no longer grants write permission or vetoes an update; it records the last confirmed observation. This separates ownership from mutable provider representation.

Alternative: tolerate only known Confluence normalization. Rejected because it keeps user edits and future provider normalization as special cases, and still cannot fulfill source-authoritative reruns.

### Semantic compare before mutation

The migrator reads the latest mapped destination and runs the existing provider-aware verifier against the intended rendered body. A complete equivalent result skips the write. A meaningful difference triggers an update with the latest provider version. Resource fallbacks and documented degradations retain their normal partial semantics; ordinary destination drift does not.

Alternative: always write on rerun. Rejected because it creates unnecessary versions, audit noise, and more opportunities for version races.

### Confirm state only after read-back

Adapters expose destination versions independently from content fingerprints. Creation, body update, and reparent operations are followed by a confirmed read. Only that read's identity, parent, semantic content, fingerprint, and version enter verified state. Immediate mutation responses may guide reconciliation but do not become the final checkpoint.

### Retry optimistic version races at the orchestration boundary

Confluence adapters classify a current-version `409` or equivalent structured response as a typed revision conflict. The migrator retries by reading the newest object, checking whether it is already equivalent, and otherwise updating it. Delays use jitter around 0.5/1/2 seconds for at most three retries. Authentication, permission, missing-object, validation, and ordinary title-collision errors do not enter this loop.

Alternative: retry every `409` in the generic HTTP client. Rejected because upload/title conflicts are not safe optimistic-version retries and require different reconciliation.

### Top-down hierarchy is independent of body drift

For a proven mapping, the expected parent is reconciled before descendants even if the body differs. The same latest-version retry protects Confluence move/update races. Descendants are blocked only after parent identity, API, permissions, network, move, or final verification actually fails.

### Comments follow destination capabilities

Confluence mapped archive comments are read, semantically compared, updated using their latest version when needed, and verified. Yandex Wiki remains append-only: a changed archive creates a linked replacement revision. Identity ambiguity remains conflict; missing mapped comments are recreated. Fingerprints/versions are stored after read-back.

### A single report overview owns run-level information

`ReportOverview` combines the illustration, title/status metadata, progress, comparative table, quality counts, result/state/report links, and sanitized JSON download. Root causes remain in typed report data but render only on affected hierarchy rows and the Problems tab. Outputs remain in the overview. The footer disclaimer is removed without changing privacy behavior.

Language and theme controls use shadcn icon buttons and tooltips. Inline flag SVGs avoid OS emoji/font variation. A click advances a fixed cycle and safe local-storage helpers preserve the current choice. Native buttons retain keyboard behavior and accessible names state both current and next modes.

## Risks / Trade-offs

- [A mapped page contains an important destination-only manual edit] → Source-authoritative behavior deliberately replaces it, but provider version history retains the prior content and the report records a safe update event.
- [A stale state points to a foreign object] → Require canonical mapping plus provider identity checks; ambiguous evidence remains conflict and is never overwritten.
- [Semantic verifier accepts an unsafe equivalence] → Preserve strict checks for meaningful text, hierarchy, links, attachments, tables, code, macros, and layouts; only existing documented normalizations are ignored.
- [Concurrent writers keep advancing a Confluence version] → Bound retries and fail the parent after the third retry so descendants are not created under an unconfirmed hierarchy.
- [Removing run-level panels hides diagnostics] → Keep every typed issue in JSON and surface it contextually in highlighted tree rows and the per-page Problems tab; retain quality totals in the unified overview.

## Migration Plan

1. Ship adapters, state fields, semantic update orchestration, comment policy, and regression tests together.
2. Existing current state is read without conversion; conflict and blocked outcomes are replanned when their mappings are still provable.
3. Build and package the revised offline report shell; only newly generated reports use it.
4. Run the existing mapped migration state as a live acceptance test after the complete automated suite.
5. Release as `4.0.0`. Rollback means reinstalling the preceding package; destination versions written by 4.0.0 remain recoverable history and are not deleted.

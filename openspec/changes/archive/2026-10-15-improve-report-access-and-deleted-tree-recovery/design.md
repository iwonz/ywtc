# Design

## Context

See `proposal.md`. The analyzed live run first confirmed that a stored root ID no longer existed, then failed while looking for a replacement by space/title. That auxiliary lookup error escaped the recovery branch before `createPage`, leaving every descendant without a staged parent. Older report accounting then obscured the cascade by displaying historical page states; current reporting already exposes the true failed/blocked outcomes.

## Goals / Non-Goals

**Goals:**

- Make every generated report directly reopenable from copied terminal output.
- Recover a missing mapped tree when its expected destination parent still exists and accepts writes.
- Prefer parent-scoped candidate discovery and preserve strict source-derived adoption checks.
- Retain bootstrap-first content, state history, resource reset, and verification guarantees.

**Non-Goals:**

- Restore a deleted destination container or space.
- Suppress permission, parent, create, conflict, or verification failures.
- Adopt an arbitrary page solely because its title matches.
- Delete or untrash destination content.

## Decisions

### Treat `last` as a selector, not a filesystem alias

Report selection normalizes `last` to the existing newest-valid-report behavior before UUID validation. Omission remains supported. Other non-UUID values are rejected, and directory containment checks remain unchanged.

Alternative: create a `last` symlink. Rejected because it introduces mutable filesystem state and cross-platform/path-traversal concerns.

### Return report identity with report paths

The report writer returns its run ID alongside directory, HTML, and JSON paths. Both success and typed migration failures use one terminal formatter to show ID, path, URL, and a command containing the resolved workdir.

Alternative: derive the ID from the directory basename in the CLI. Rejected because it duplicates bundle-layout knowledge and weakens typing.

### Prefer parent-scoped Data Center child lookup

The Data Center client enumerates `/rest/api/content/{parentId}/child/page` with bounded pagination and resolves an exact title match before fetching its complete body. The adapter uses this method for recovery and ordinary direct-child collision checks; space-wide title lookup remains only as a compatibility fallback when the client has no scoped operation.

Alternative: rely exclusively on the space/title content query. Rejected because the observed server returned a false `404` for that auxiliary lookup after the destination container had already been resolved.

### Isolate lookup failure from verified creation

Candidate lookup and collision lookup are individually guarded. A lookup failure becomes one retryable issue; if the expected parent is available, recovery still attempts `createPage` with the stable stored title and source-derived bootstrap. The create result must be read back and content-verified before state changes. A create conflict remains a failure rather than causing unsafe adoption.

Alternative: treat every lookup error as a hard stop. Rejected because lookup is advisory while verified creation is the authoritative write contract.

### Rebuild hierarchy top-down from state

The existing deterministic graph order stages parents before children. Once a missing parent is recreated and checkpointed, descendants use that new destination page as their expected parent. Each missing descendant independently resets old resource destinations, preserves prior IDs, and reuses verified cache files.

Alternative: discard the whole state with `--fresh`. Rejected because it loses mapping history, can create duplicates outside the deleted subtree, and is unnecessary for recoverable mappings.

### Distinguish provider normalization from concurrent edits

The migration re-reads bootstrap content after resource transfer. A raw fingerprint change is accepted only when the provider-aware semantic verifier confirms identical meaningful text, headings, lists, tables, code, links, images, anchors, macros, and structure. Accepted serialization-only changes are recorded as safe normalizations; any meaningful difference remains a conflict.

Alternative: remove the mid-transfer conflict check. Rejected because it could overwrite a real user edit made during the run.

### Reconcile raw snapshots like other resources

Before uploading a deterministic `ywtc-source-*` snapshot, the migration checks the current destination resource inventory by recorded ID and case-insensitive filename, verifies size and SHA-256 when the adapter supports downloads, and updates or adopts the confirmed attachment. An uncertain upload response is reconciled by a fresh listing before reporting failure.

Alternative: treat duplicate snapshot names as an acceptable degradation. Rejected because the raw snapshot is the loss-safety representation for vendor-specific content and duplicate failures are retryable transfer defects.

## Risks / Trade-offs

- [Lookup failure hides an existing same-title page] → Never adopt it; attempt create, let the provider reject a conflict, and report the failure.
- [Large parent child lists increase reads] → Paginate with the configured read limiter and stop immediately after an exact title match.
- [A deleted tree causes many consistency waits] → Preserve bounded verification for correctness; a later optimization can safely short-circuit descendants only with provider evidence that deletion cascades.
- [Provider rewrites storage markup asynchronously] → Require semantic identity before proceeding and retain strict conflict behavior for meaningful changes.
- [A stale snapshot mapping points at another page] → Reconcile only against the current page's attachment inventory and never reuse a remote ID outside it.
- [Recovery partially succeeds] → Atomically checkpoint every verified page so the same state resumes from the last successful object.

## Migration Plan

1. Add the report selector/output contract and focused tests.
2. Add parent-scoped child lookup and guarded recovery creation with contract tests.
3. Simulate a deleted multi-level subtree and verify hierarchy, state history, cached resources, and report outcomes.
4. Verify provider normalization and stale snapshot mapping recovery without suppressing genuine conflicts.
5. Run the complete quality gate, archive the OpenSpec change, and release as a patch.

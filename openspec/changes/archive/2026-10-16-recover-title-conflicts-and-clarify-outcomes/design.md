# Design

## Context

See [proposal.md](./proposal.md) for motivation. Page-title availability is currently checked before creation, but Confluence enforces uniqueness authoritatively during `POST`. A race, permission-limited lookup, or inconsistent search index can therefore reject the original title after the precheck. The migration reports the rejected page as failed, reports every dependent page as another error, and leaves their resources in a misleading `planned` state during a live run.

The current state and report models also use different fallbacks when an object has not reached its execution phase. That makes state, terminal output, HTML/JSON reports, and `reports list` disagree about whether work was attempted. Existing state identities and verified destination mappings must remain reusable, and unrelated destination content must never be adopted merely because a title matches.

## Goals / Non-Goals

**Goals:**

- Recover recognized Confluence title collisions through deterministic, bounded alternate titles.
- Preserve source-derived bootstrap content and expected parent verification for every successful candidate.
- Give each selected page, resource, and enabled comment archive exactly one exclusive outcome.
- Represent dependency blocks causally without inflating root error counts.
- Keep repeated runs idempotent and able to resume previously blocked branches without `--fresh`.
- Make raw-render fallbacks identify the renderer condition or normalized construct category when known.

**Non-Goals:**

- Changing state identity, command-line syntax, or destination deletion policy.
- Renaming an already verified destination page solely to prefer a newer candidate.
- Treating every Confluence `400` as a title collision.
- Rewriting historical reports or requiring a state migration.
- Hiding genuine Grid-to-static-table or raw-fallback degradations.

## Decisions

### 1. Classify title collisions at the provider boundary

Confluence Data Center and Cloud adapters will translate only recognized duplicate-title create failures into a provider-neutral `DestinationTitleConflictError`. Classification requires a `400` or `409` plus structured/error text associated with title uniqueness, followed by a space-wide title lookup when available. An ordinary validation `400` remains the original `HttpRequestError`.

This keeps vendor response parsing out of the transfer engine while giving the allocator a typed signal. Treating all `400` responses as retryable was rejected because it would hide invalid bodies, permissions, size limits, and incompatible API behavior.

### 2. Allocate candidate titles centrally and deterministically

One allocator will be used by initial creation and missing-mapping recreation. It yields no more than ten unique candidates in this order:

1. the normalized source title;
2. the title with a stable final-slug suffix;
3. the title with the slug and first eight hexadecimal characters of the canonical source identity hash;
4. deterministic sequence variants of the hash candidate until the ten-candidate bound is reached.

Unicode titles are retained; only suffix components are sanitized and length-limited. The same source page therefore receives the same candidates across reruns. Random suffixes were rejected because they prevent reconciliation and create duplicates after interrupted responses.

Each subsequent `POST` is issued only after a typed duplicate-title failure. On ambiguous transport outcomes, the adapter searches under the expected parent and reuses a page only when its body is semantically equivalent to the source-derived bootstrap. Title equality alone is never sufficient.

### 3. Persist the actual title and dependency cause

Successful page mappings retain the title actually accepted by the destination. A page that cannot be created records one root failure. Descendants receive persisted `blocked` page states with `blockedByPageId`, `blockedByCode`, and a redacted readable reason. Their resources and enabled comment archives receive the same causal reference in report outcomes and, where their state records exist, in state.

Persisting blocked pages makes top-down resume deterministic. Once the upstream page succeeds, ordinary processing replaces the blocked outcome and proceeds without a new state identity or duplicate destination objects.

### 4. Use one exclusive outcome vocabulary across object types

Page, resource, and comment outcomes share these operational meanings:

- `planned`: dry-run only;
- `not-started`: a live run was interrupted before the operation could begin;
- `blocked`: a known upstream dependency prevented the operation;
- `failed`: the object's own operation was attempted and failed;
- `partial`: useful destination data was verified with a fallback or degradation;
- `complete`: destination data was verified without unresolved loss.

Pages additionally retain `conflict` for protected user edits; comment archives retain `stale` and `skipped` for their existing lifecycle. Existing accepted status strings remain readable so current state files can resume, but every newly completed live run normalizes any unresolved inventory item to `blocked`, `not-started`, or its attempted outcome. `planned` is emitted only by dry-run.

Inventory totals and outcome totals are separated. Every source resource is counted once in both: inventory describes what exists, while outcome describes what happened during the run.

### 5. Model blocked work as dependency issues, not errors

The issue collector will distinguish root failures from dependent blocks. A block has a stable code, upstream page ID, object identity, readable cause, and retry action, but it does not increment the error count. Terminal output, state run counters, report JSON/HTML, and catalog summaries derive from the same finalized collector and outcome set.

The terminal adds a causal line summarizing root errors and dependent pages/files/comments. HTML groups dependent objects below their upstream failure and recommends rerunning the same command after the cause is resolved. This avoids seven dependent pages appearing as seven additional API failures.

### 6. Finalize untouched inventory according to run mode

At report finalization, any selected object without an attempted or dependency outcome is converted as follows:

- dry-run: `planned`;
- interrupted/cancelled live run: `not-started`;
- normally terminated live run with a failed/conflicted ancestor: `blocked` with that ancestor;
- otherwise: `not-started` plus an invariant issue, since a normal live run should have processed it.

This central finalization avoids scattered `planned` defaults and ensures all output surfaces see the same result.

### 7. Explain raw fallback from normalized evidence

When preferred rendering is empty despite non-empty normalized content, diagnostics will classify known vendor nodes/directives, unsupported constructs, or renderer failure mode. The message contains no source body. The full escaped raw fallback and `partial` outcome remain unchanged so diagnostic improvements cannot reduce preservation.

## Risks / Trade-offs

- **[Vendor error messages vary by version or locale]** → Combine status, structured fields, known patterns, and a title lookup; unknown cases remain ordinary errors rather than unsafe retries.
- **[Search is eventually consistent after an ambiguous create]** → Use existing bounded consistency retry before deciding creation failed; adopt only parent- and bootstrap-matching content.
- **[Ten candidates can all be occupied]** → Stop with one actionable root error and causal blocked subtree instead of generating unbounded names.
- **[Persisted blocked records expand state size]** → Records are small and make resume/report reconciliation deterministic; raw source content is not duplicated.
- **[Older state may contain live `planned` resources]** → Treat them as unresolved input and recompute outcomes during the next run; do not rewrite state until the normal atomic checkpoint.
- **[Provider normalization complicates bootstrap matching]** → Reuse the existing semantic body verifier rather than byte or markup equality.

## Migration Plan

1. Add typed title-conflict classification and deterministic allocator tests before changing the migration path.
2. Extend state/report schemas with optional causal fields and new outcomes while retaining readability of existing current state files.
3. Route page creation and recreation through the allocator, then add causal blocking/resume coverage.
4. Centralize outcome finalization and use it for terminal, reports, catalog, and run counters.
5. Add README status tables and complete all package, browser, OpenSpec, and project checks.
6. Release as `3.4.1`. Rollback is the previous package version; no destination or state deletion is required because alternate-title pages remain valid mapped outputs.

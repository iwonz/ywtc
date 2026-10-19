# Design

## Context

See `proposal.md` for motivation. The migration pipeline already separates create-time bootstrap content, final rendering, destination read-back, atomic state, typed transformation notices, and provider adapters. The defects cross orchestration, conversion, verification, download, and reporting boundaries, so recovery must preserve current state identity and non-destructive behavior.

## Goals / Non-Goals

**Goals:**

- Make a successfully created/readable destination page recoverable before stricter content classification.
- Make verification semantic enough for provider normalization while retaining strong loss detection.
- Make transformation diagnostics and streamed resources isolated per object and retryable.
- Preserve meaningful managed-image alternative text in Confluence without false partial results.
- Improve mapped-update and report diagnostics without changing the CLI or state identity.

**Non-Goals:**

- Pixel-identical rendering across providers.
- Automatic deletion or consolidation of duplicates created by older releases.
- Downloading external images or weakening managed-resource verification.
- Retrying arbitrary source/destination locator failures or every `403` response.

## Decisions

### Checkpoint confirmed identity before content classification

Creation returns a read-back destination object as soon as immutable identity, expected parent, and non-placeholder bootstrap are confirmed. The orchestrator immediately writes a `skeleton-created`/unverified mapping atomically, then performs semantic classification and final refinement. A failed assertion therefore changes outcome, not ownership memory.

Alternative: keep the current single final checkpoint. Rejected because a provider normalization failure forgets a real mutation and makes retries duplicate-prone.

### Recover uncheckpointed candidates only with deterministic evidence

Before a create retry, candidate lookup remains restricted to the expected parent and deterministic title variants. Adoption requires one unambiguous immutable candidate and canonical semantic containment of the source bootstrap. Several candidates remain an ownership conflict.

Alternative: adopt by title alone. Rejected because titles are not immutable ownership evidence.

### Wrap Diplodoc's process-global log synchronously

A single wrapper clears the library log immediately before transformation, copies that invocation's returned diagnostics, and clears it in `finally`. All direct transformation call sites use the wrapper. The transform call is synchronous, so no asynchronous interleaving is introduced.

Alternative: filter historical messages after transformation. Rejected because identical legitimate diagnostics cannot be attributed reliably after leakage.

### Canonical verification uses meaningful multisets

Verification derives canonical non-empty text blocks, list items, table cells/rows, code blocks, provider macros, layouts, resource references, and links. Expected payloads must be contained in actual payloads with multiplicity. Empty scaffolding, provider wrappers, legacy color tokens, service anchors, and regenerated same-page anchor IDs are normalization-only. External and page links remain strict.

Alternative: normalized full-document string equality. Rejected because harmless wrapper and empty-node changes cause false failures. Comparing text alone is also rejected because it misses lost structure and references.

### Retry streams outside the header-level HTTP retry

Yandex downloads write each attempt to a unique sibling temporary file. Stream completion produces hash and actual size, then atomic rename publishes the cache entry. Retriable premature close/reset/aborted failures remove only that attempt and use bounded jittered backoff; cancellation and permanent HTTP failures are not multiplied unnecessarily.

Alternative: rely on Axios request retries. Rejected because the promise has already resolved once response headers create the stream.

### Treat ambiguous size strings as unknown

Numeric metadata and strings with explicit byte/unit suffixes remain parseable. Unitless decimal strings remain unknown until a file is verified, preventing false byte totals and misleading progress.

### Preserve attachment alt as a readable fallback

Confluence attachment images retain native `ac:alt`; meaningful alt also receives a small adjacent semantic caption that survives supported Data Center normalization. Verification accepts native alt or the exact fallback payload and records one adaptation. Empty alt and filename-equivalent labels do not create captions.

Alternative: ignore missing alt after read-back. Rejected because accessibility information would be silently lost. Provider-specific undocumented attributes are rejected as unreliable.

### Limit `403` retry to proven mapped final updates

Only a mapped page final-update path re-reads the same immutable ID and retries once after a short jitter. Persistent rejection keeps verified bootstrap content and emits an update-rejected issue. Generic HTTP diagnostics describe `403` as forbidden without claiming the exact cause.

## Risks / Trade-offs

- [Semantic containment could accept provider-added text] → Require every expected meaningful payload and every strict reference while allowing additions only in provider wrappers/captions.
- [Caption fallback changes presentation] → Emit it only for meaningful attachment alt that the provider otherwise loses and report it as an adaptation.
- [Retry downloads consume extra bandwidth] → Bound attempts, reuse verified cache, and never publish a partial attempt.
- [Candidate recovery could adopt unrelated content] → Require expected parent, deterministic title, one candidate, immutable ID, and semantic source compatibility.
- [A checkpoint can describe an unverified body] → Persist explicit unverified outcome; never mark it complete until final read-back verification.

## Migration Plan

1. Ship without changing config, state identity, or CLI inputs.
2. Existing failed/blocked mappings are replanned normally; confirmed state IDs are reused.
3. Earlier uncheckpointed pages are recovered only when candidate evidence is unique; otherwise existing allocator protection remains.
4. Rollback is code-only. Existing state remains readable and destination history/data remain untouched.

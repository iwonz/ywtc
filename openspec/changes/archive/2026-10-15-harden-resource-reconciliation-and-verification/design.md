# Design

## Context

See `proposal.md` for motivation. The transfer pipeline currently uses display filenames as resource-map keys, treats every conversion warning as degradation, compares destination DOM fingerprints byte-for-byte after normalization, and aggregates issues independently in state, reports, and terminal summaries. Destination page reads use the ordinary request retry policy, which intentionally does not retry `404`.

The implementation must repair existing resumable state without changing state identity, preserve destination content, keep resource I/O streaming, and work across all supported provider directions and filesystem exports.

## Goals / Non-Goals

**Goals:**

- Give each source resource one immutable identity, a preferred destination filename, and a many-alias lookup that never guesses among ambiguous basenames.
- Make downloads and uploads resumable across interruption and uncertain responses.
- Recover only previously confirmed destination mappings from eventual-consistency or deleted/missing IDs.
- Verify meaningful provider content while tolerating safe serialization differences.
- Produce one deduplicated issue view and accurate actual-byte totals everywhere.

**Non-Goals:**

- Deleting, renaming, or overwriting unrelated destination attachments.
- Retrying an unknown locator `404` or adopting a title-only match outside the expected parent.
- Hiding meaningful rendering degradation to make a run appear complete.
- Changing CLI options, automatic state identity, or requiring a fresh run.

## Decisions

### Resource binding index

`SourceResource` gains `preferredName` and normalized `referenceAliases`. Rendering uses a `ResourceBindingIndex` containing bindings by immutable resource ID and an alias-to-ID index. Exact URL/path/provider aliases are registered first; a basename is registered only when it resolves to exactly one resource. This prevents the last duplicate display name from silently winning, while supporting source syntax variations.

Alternative considered: keep a `Map<filename, resource>` and add numeric suffixes. This cannot reliably associate a source link with the right resource when API names are duplicated.

### Deterministic destination names and cache checkpoints

Each page obtains its destination attachment listing once. The allocator reserves names case-insensitively in this order: confirmed state mappings, preferred source names, then a stable source-ID hash before the extension. Failed mappings do not reserve unsafe historical names. After download, ywtc immediately persists SHA-256, actual size, MIME type, cache path, and planned destination name before upload. A later run validates the cached size/hash and skips the network download.

If a destination name is occupied or an upload outcome is uncertain, ywtc compares the remote size and streaming SHA-256 when the adapter exposes a download. Exact matches are adopted; otherwise the allocator selects the next stable candidate. This favors safety over overwriting an unknown object.

### Scoped consistency recovery

A consistency-read helper wraps only `verifyPage` calls for IDs already present in state or returned by create/update. It retries `404` up to five times with jitter around 0.5, 1, 2, 4, and 8 seconds. Ordinary locator resolution remains unchanged.

After exhaustion, recovery checks that the expected parent is readable, performs a parent-aware child lookup, and adopts a candidate only if title plus source-derived content identify it. Otherwise it creates a replacement directly with bootstrap content and verifies it through the same helper. The old ID is appended to page history, attachment destination mappings are cleared while cache metadata is retained, and the top-down pass naturally restores the expected parent. No object is deleted.

### Semantic verification model

Normalization produces a typed semantic signature: normalized visible text, meaningful block sequence, links, anchors, images, attachment references, table cells, code blocks, and macro names/parameters. Empty elements, service-only anchor spans, allowed provider attributes, namespace ordering, whitespace, and equivalent entities are ignored. Confluence Storage Format is normalized in XML mode so void elements remain self-closing and valid for the destination parser. Verification returns `complete`, `partial`, or `failed` with structured diagnostics rather than only throwing on a hash mismatch.

Meaningful omission is always failed. A documented renderer fallback that retains all data is partial. A harmless provider serialization change is complete. Exact legacy placeholders remain a hard failure except in the existing targeted repair path.

### Conversion diagnostics and tree nodes

ANSI control codes are removed at the conversion boundary. Empty headings are removed from normalized HTML only if they contain no text, embedded content, or anchor identity; their corresponding Diplodoc `Header without title` diagnostic becomes a safe normalization. Other diagnostics remain degradations.

Supported YFM tree directives are extracted into typed nodes before generic YFM conversion. Confluence renders a children macro; Yandex preserves the directive; filesystem renderers materialize a tree from the frozen graph supplied through render context. Unknown directives retain the existing readable fallback and raw snapshot behavior.

### Unified issue collector

A run-scoped issue collector stores code, severity, phase, page/resource identity, retryability, redacted message, and occurrence count. Its stable deduplication key excludes retry attempts. Report page details reference these issues, while report summary, state run counters, terminal summary, and catalog derive counts from the same serialized collection. Normalizations and degradations are distinct from warnings and final errors.

## Risks / Trade-offs

- [Remote attachment hashing can add bandwidth] → Hash only when reconciling an occupied or uncertain name; normal verification uses ID and actual size.
- [Consistency retries can delay confirmed failures] → Restrict the schedule to previously confirmed IDs and cap it at five attempts.
- [Semantic comparison can miss an unusual provider rewrite] → Compare multiple explicit dimensions and retain golden tests for every supported structural element.
- [State gains optional fields] → Keep them optional so current state resumes in place; validate one strict current shape and write the enriched form on the next checkpoint.
- [Parent-aware lookup APIs differ] → Verify ancestry when exposed and decline adoption when parent identity cannot be confirmed.

## Migration Plan

1. Ship the optional state metadata and new binding/verification logic together.
2. On first resume, replan only failed resource mappings; preserve confirmed resources and page mappings.
3. Run the existing partial migration state to repair resources and transient page mappings.
4. Roll back by reinstalling `3.2.0`; destination additions remain non-destructive, while enriched optional state fields are ignored only if that version's strict state reader permits them, so operational rollback should use the automatic pre-run state backup when necessary.

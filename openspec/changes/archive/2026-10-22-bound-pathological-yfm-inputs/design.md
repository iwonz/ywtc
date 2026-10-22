# Design

## Context

YFM normalization and final Confluence rendering synchronously invoke Diplodoc. The migration already yields between pages, but JavaScript cannot yield while a single third-party parser call is executing. A megabyte-scale whitespace-free inline data URI can therefore spend unbounded time inside a regular-expression match, blocking all four transfer workers, heartbeat output, checkpoints, and signal callbacks. The same raw input is also scanned by `linkify-it` for implicit links.

The existing content-safety pipeline already supports visible fallbacks, degradation notices, and raw source snapshots. The repair should use those guarantees rather than discard input, invent provider-specific mutations, or silently mark a truncated representation complete.

## Goals / Non-Goals

**Goals:**

- Keep parser and implicit-link work linear and bounded for untrusted lexical payloads.
- Preserve normal YFM surrounding an oversized payload instead of falling back the entire page when avoidable.
- Preserve the exact original page through the existing raw snapshot and `partial` semantics.
- Make the protection common to normalization, remote rendering, and report previews.
- Keep retries and resumes deterministic without changing state identity.

**Non-Goals:**

- Decode arbitrary inline data URIs into new managed attachments in this patch.
- Promise pixel-identical rendering of oversized embedded payloads.
- Add a CLI tuning flag or provider-specific size limit.
- Terminate or modify an already running older process.

## Decisions

### Preprocess lexical payloads before Diplodoc

Perform one explicit linear scan before every Diplodoc invocation. Contiguous non-whitespace tokens above a conservative fixed bound are replaced with a short deterministic marker containing the payload category and byte/character count. The scanner returns structured notices, and the wrapper appends those notices to the copied transform diagnostics.

This retains normal paragraphs, tables, headings, and links around the payload. Throwing before the parser was rejected because the existing catch path would turn the whole page into raw code. Passing the original input to a worker with a timeout remains a possible future defense, but it adds worker serialization and packaging complexity and still consumes CPU until termination; the deterministic lexical guard directly prevents the reproduced pathological shape.

### Preserve original content outside the transform input

Only the transient parser input is bounded. `SourcePage.rawContent`, cached source pages, fingerprints, state identity, and raw snapshots remain byte-for-byte based on the original content. The emitted diagnostic is a degradation, so the existing pipeline uploads or exports the original snapshot and cannot report the page as complete.

### Bound linkification by lexical regions

Replace full-document `linkify-it.match()` calls with a shared scanner that groups normal whitespace-delimited tokens into bounded chunks. Oversized tokens are skipped by the regex-based matcher while normal chunks retain absolute offsets and existing link behavior. Explicit Markdown/wiki links continue through their dedicated parsers.

Chunk boundaries occur only at whitespace, so ordinary URLs are not split. A single token above the bound is preserved as text and covered by the raw snapshot when the transform guard classifies it. This is preferable to applying an arbitrary substring window that could invent partial URLs.

### Typed, stable diagnostics

The transform wrapper emits a stable diagnostic prefix and a bounded message without including payload contents. Existing transformation-notice classification records it as a degradation. Repeated normalization/render passes produce the same message and do not expose inline data.

## Risks / Trade-offs

- **A legitimate very long whitespace-free code token is not rendered verbatim in the destination body** → Its exact value remains in the raw snapshot, the surrounding page remains readable, and the status is explicitly `partial`.
- **A future pathological parser input uses many short tokens** → The current fix covers the reproduced general class; regression tests and bounded linkification reduce exposure, while full worker isolation can be added later if evidence identifies another uninterruptible pattern.
- **Bounded chunks slightly change linkifier context at whitespace boundaries** → Boundaries are semantically safe for URLs, and tests cover punctuation, multiple links, offsets, and surrounding text.
- **Large raw snapshots may still be expensive to upload** → Uploading is streamed and independently retryable; it no longer blocks synchronous parser progress.

## Migration Plan

Ship as a patch release. Existing state IDs and checkpoints remain valid. After stopping an affected older process and updating ywtc, repeating the same migration reuses completed pages/resources, bounds the pathological page during rendering, records its raw snapshot, and continues the remaining queue. Rollback is the prior package version; no runtime data conversion is required.

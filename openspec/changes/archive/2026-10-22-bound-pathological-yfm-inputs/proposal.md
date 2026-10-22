# Proposal

## Why

A single source page containing a very large inline payload can drive the synchronous YFM parser into pathological regular-expression work, monopolizing Node's event loop indefinitely. This stops progress heartbeats, signal handling, checkpoints, and every otherwise independent transfer worker, so one representable-but-hostile content shape can stall a migration of thousands of pages.

## What Changes

- Inspect YFM input in linear time before invoking the vendor parser and replace only oversized lexical payloads with an explicit readable marker.
- Preserve the complete unmodified source through the existing raw-snapshot path and classify the bounded rendering as a degradation rather than silently dropping data.
- Run implicit-link discovery and rendering over bounded lexical chunks so an oversized token cannot trigger unbounded `linkify-it` work.
- Expose the bounded-input condition in page diagnostics and allow all independent pages to continue through transfer and verification.
- Add regression and large-input tests proving that ordinary links remain clickable while megabyte inline payloads finish promptly without embedding private fixture data.
- Do not delete or rewrite source/destination data, reduce network safety, or weaken the requirement that every omitted visible payload remains recoverable from a raw snapshot.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `wiki-migration`: Bound parser and linkifier work for pathological source payloads while preserving source data, progress responsiveness, and independent transfer continuity.

## Impact

The change affects YFM preprocessing, implicit-link extraction/rendering, transformation diagnostics, migration content tests, and the observable-progress/content-fidelity requirements. It adds no CLI option, state identity change, dependency, or destructive behavior.

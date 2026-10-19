# Proposal

## Why

Large transfers can currently create valid destination pages and then lose their identities when strict read-back verification rejects provider-normalized content. Independent reliability defects also leak Diplodoc diagnostics between pages, treat interrupted streamed downloads as final failures, trust ambiguous Yandex size metadata, and mark complete Confluence image transfers partial when attachment-image alt attributes are stripped.

## What Changes

- Checkpoint every confirmed destination page identity immediately after create/read-back, before strict content classification, and recover equivalent uncheckpointed candidates on rerun without creating duplicates.
- Make destination verification compare meaningful provider-neutral content while accepting empty scaffolding removal, legacy style-token normalization, generated-anchor changes, and provider wrappers without accepting lost text, links, tables, code, images, or attachments.
- Isolate Diplodoc transformation diagnostics per invocation so one page cannot inherit another page's warnings.
- Retry the complete streamed Yandex resource download through a temporary file and use actual downloaded bytes; treat ambiguous unitless decimal metadata as unknown.
- Preserve meaningful attachment-image alternative text through a verified Confluence-readable fallback when native storage normalization drops `ac:alt`.
- Retry a mapped page's transiently rejected final update only after confirming that the mapped page still exists, while reporting persistent `403` responses as provider rejections rather than proven permission failures.
- Use stable typed report codes for transformation notices instead of embedding full diagnostic messages in issue identity.
- Keep source and destination data non-destructive: no pages, attachments, comments, versions, state, or reports are deleted.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `wiki-migration`: strengthen confirmed-page checkpointing, provider-aware semantic verification, per-page transformation diagnostics, streamed resource recovery, metadata accounting, image accessibility preservation, mapped-update retry, and stable issue identity.

## Impact

- Migration orchestration and state checkpoint ordering.
- YFM normalization, Confluence rendering, and destination verification.
- Yandex Wiki resource download and metadata parsing.
- HTTP diagnostics and mapped destination update recovery.
- Report issue collection and regression tests.
- No CLI flags, state identity, configuration shape, or destructive behavior changes.

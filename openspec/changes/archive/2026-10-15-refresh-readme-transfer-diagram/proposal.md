# Proposal

## Why

The README header still presents a one-way Yandex Wiki to Confluence migration, while ywtc now supports both providers as sources and Yandex Wiki, Confluence, Markdown, and HTML as destinations. The visual should communicate the current product model without discarding the established dark technical style.

## What Changes

- Replace the one-way endpoint composition with two source nodes feeding the existing `ywtc` pipeline.
- Show four destination nodes: Confluence, Yandex Wiki, Markdown, and HTML.
- Use clear left-to-right converging and branching arrows without vendor-colored frames or decorative connector outlines.
- Preserve the current canvas, dark grid aesthetic, restrained cyan/blue palette, and central pipeline treatment.
- Update the README image alternative text so the same transfer model is available to non-visual readers.

No runtime behavior, CLI contract, release channel, credential handling, or migration data changes. No source or destination content is modified by this documentation-only change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `project-maintenance`: Require the README header to represent the provider-neutral source and destination matrix accurately.

## Impact

- `docs/assets/readme-header.png`
- `README.md`
- `openspec/specs/project-maintenance/spec.md` after archival

No production dependencies or public APIs are affected.

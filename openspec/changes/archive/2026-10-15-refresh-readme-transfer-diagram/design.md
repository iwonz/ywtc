# Design

## Context

The current 2171×724 PNG uses a dark gridded background, large vendor marks at the outer edges, and a cyan six-stage `ywtc` pipeline in the center. Its single incoming and outgoing arrows encode only Yandex Wiki → Confluence even though the documented product model is provider-neutral and includes static exports.

## Goals / Non-Goals

**Goals:**

- Retain the existing banner proportions, background, typography hierarchy, visual weight, and pipeline icon language.
- Make source and destination cardinality legible at README display size.
- Keep exact, correctly spelled endpoint labels and matching accessible alternative text.

**Non-Goals:**

- Redesign the ywtc wordmark or central processing stages.
- Add animation, interactive behavior, external assets, or runtime dependencies.
- Change migration behavior, compatibility claims, or release metadata.

## Decisions

### Use a converging-and-branching flow

Two compact source nodes on the left converge through directed cyan connectors into the existing center pipeline. The pipeline then branches into four compact destination nodes on the right. This communicates a many-to-many transfer system without drawing every pairwise route, which would be visually noisy.

Alternative considered: a full source-by-destination matrix. It was rejected because eight explicit routes would compete with the central content pipeline and become unreadable at typical README widths.

### Edit the existing raster composition

The current image remains the visual reference and edit source. The canvas size and core styling are preserved while the endpoint layout and connectors are replaced. This minimizes visual drift compared with generating a new composition from scratch.

Alternative considered: a deterministic SVG diagram. It was rejected for this change because the user explicitly requested preservation of the existing raster illustration style and asset.

### Keep endpoint treatment neutral

Provider and format nodes use the existing restrained blue/cyan icon treatment without red or blue bounding frames. Connectors remain simple directed lines without outlines around `ywtc` or decorative enclosing paths.

### Treat accessibility text as part of the diagram

The README `alt` attribute states the full source → pipeline → destination relationship. This provides a deterministic semantic fallback even if small raster labels are difficult to parse or the image cannot be loaded.

## Risks / Trade-offs

- **Generated typography may contain label errors** → Visually inspect the full-resolution output and regenerate if any endpoint label is misspelled or ambiguous.
- **Four destination nodes can crowd the right side** → Use a balanced 2×2 arrangement and keep labels concise.
- **Editing can drift from the approved visual style** → Use the existing asset as the edit reference and explicitly preserve the background, palette, dimensions, and center pipeline.
- **Static image cannot enumerate future formats automatically** → Keep the semantic contract focused on the currently supported destinations and update it with future capability changes.

## Migration Plan

1. Generate an edited candidate from the current banner.
2. Inspect the candidate at full resolution for labels, arrow direction, framing, and style continuity.
3. Replace the tracked PNG and update its README alternative text.
4. Run the complete project checks; rollback is a normal Git revert of the documentation commit.

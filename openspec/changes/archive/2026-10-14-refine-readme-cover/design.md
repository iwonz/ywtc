## Context

The existing 2172×724 README header is approved in composition and content.
Only three decorative frame groups are unwanted: the red Yandex Wiki panel
border, the blue Confluence panel border, and the outline surrounding the
central `ywtc` pipeline.

## Goals / Non-Goals

**Goals:**

- Remove only the specified frames.
- Restore the dark grid background seamlessly where lines are removed.
- Preserve the source asset's dimensions and all approved visual content.

**Non-Goals:**

- Redesigning logos, typography, icons, color grading, or composition.
- Changing README text or any runtime behavior.

## Decisions

Use ImageGen in precise image-edit mode with the current cover as the reference.
The edit prompt will identify every removable outline and enumerate invariants
that must remain unchanged. This is preferable to regenerating the illustration,
which would introduce unnecessary variation, or manually painting the complex
grid and glow background.

Inspect the generated bitmap at original resolution before replacing the tracked
asset. Retain the existing PNG path so the README needs no markup change.

## Risks / Trade-offs

- **Generative drift** → Constrain the prompt to a precise-object edit, compare
  the output visually with the reference, and iterate if unrelated details move.
- **Visible inpainting seams** → Require matching grid, texture, illumination,
  and glow continuity in each removed-frame area.
- **Dimension changes** → Verify the replacement retains the current wide cover
  aspect and suitable full-width README resolution.

## Migration Plan

Replace the single tracked PNG after visual verification. Rollback consists of
restoring the prior asset from Git history; there is no data migration.

## Open Questions

None.

## Context

The current 2172×724 README banner already communicates a left-to-right knowledge migration with document hierarchy, links, attachments, images, and tables. Its abstract endpoints are not identifiable as Yandex Wiki and Confluence without reading the surrounding text.

## Goals / Non-Goals

**Goals:**

- Preserve the ultra-wide composition, indigo technical style, central migration flow, and document hierarchy.
- Add a high-contrast Yandex Wiki logo/wordmark on the left and a high-contrast Confluence logo/wordmark on the right.
- Keep both marks comfortably inside the crop and legible at typical GitHub README widths.
- Save the approved edit at the existing asset path so README markup and package metadata remain unchanged.

**Non-Goals:**

- Redesigning the project identity or README layout.
- Altering source code, migration behavior, credentials, retry/resume/conflict handling, or format-degradation behavior.
- Loading logos remotely at README render time.

## Decisions

- Use the existing image as the edit target so style and composition remain consistent.
- Render the exact labels `Yandex Wiki` and `Confluence` alongside recognizable product marks; label accuracy is part of visual acceptance.
- Place each brand as a clean illuminated badge integrated into its corresponding endpoint, not floating over the central data stream.
- Keep the image project-local as PNG and inspect the original-resolution output before replacing the current asset.

Alternative considered: overlaying separate SVG logos in README HTML. Rejected because the user asked for the illustration itself to communicate the products and a single image renders more consistently across Markdown hosts.

## Risks / Trade-offs

- **[Generated wordmark is misspelled]** → Inspect at original resolution and iterate with a text-only correction prompt if needed.
- **[Marks are lost when scaled down]** → Use large simple badges with strong contrast and safe margins.
- **[Edit drifts from the established illustration]** → Explicitly lock aspect ratio, scene geometry, colors, document flow, and all non-brand elements.

## Migration Plan

Load the current asset, generate a non-destructive edited candidate, inspect it at original resolution, then copy only the accepted candidate over `docs/assets/readme-header.png`. Run project and package checks afterward. Rollback is restoration of the preceding asset from version control.

## Open Questions

None.

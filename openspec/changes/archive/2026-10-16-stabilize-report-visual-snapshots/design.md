# Design

## Context

See `proposal.md` for motivation. The report shell currently declares Inter first but does not ship it, so macOS and Linux resolve different fallback fonts. The UI is built by Vite and `vite-plugin-singlefile`; reports must remain one autonomous HTML file with no runtime network access.

## Goals / Non-Goals

**Goals:**

- Use the same Latin and Cyrillic glyph metrics on supported development and CI platforms.
- Preserve strict snapshot comparison and the existing report layout.
- Keep the font private, offline, and included in installed-package report generation.

**Non-Goals:**

- Redesign typography, change dashboard content, or alter migration/report data contracts.
- Introduce a font CDN, a report server, or platform-specific visual baselines.
- Relax screenshots enough to hide real layout regressions.

## Decisions

### Bundle Fontsource Inter variable subsets through Vite

Add the Fontsource Inter variable package as a development/build dependency and import the weight-axis CSS for Latin and Cyrillic from the report entry point. Fontsource supplies explicit `@font-face` rules and local WOFF2 assets; the existing single-file plugin converts those assets into the report HTML.

Copying a font from an unrelated transitive dependency was rejected because its glyph coverage and licensing boundary are not part of ywtc's build contract. Depending on system fonts was rejected because it caused the observed metric drift. A CDN was rejected because reports are offline and private.

### Retain one strict cross-platform snapshot set

Keep the existing snapshot names and comparison threshold. Once glyph metrics are deterministic, a single baseline catches genuine responsive or theme regressions and avoids duplicated platform snapshots.

Increasing `maxDiffPixelRatio` was rejected because the CI difference already exceeds the intended tolerance and includes page-height drift, which should remain detectable.

### Verify the generated artifact, not only source imports

Build/report and package smoke checks continue to open the generated file. Add an assertion that the shell contains an inlined WOFF2 data resource and does not reference an external font URL, proving isolated installations receive the same typography.

## Risks / Trade-offs

- **[Larger generated HTML and npm tarball]** → Import only the normal variable weight CSS and required Latin/Cyrillic subsets; verify packed size remains practical.
- **[Font loading can race screenshots]** → Playwright already waits for `document.fonts.ready`; retain that stabilization path.
- **[Unsupported glyphs still fall back]** → Keep a generic sans-serif fallback after Inter while explicitly covering the RU/EN UI character sets.

## Migration Plan

1. Add the self-hosted font dependency and report entry import.
2. Rebuild the shell and regenerate the four strict visual baselines if the embedded typeface changes their intentional pixels.
3. Run complete local checks, then validate Linux CI before resuming the existing `3.5.0` Release Please flow.

Rollback is a normal code revert; previously generated reports remain autonomous and unchanged.

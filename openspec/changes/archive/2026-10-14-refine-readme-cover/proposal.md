## Why

The approved README cover communicates the migration flow well, but the colored
frames around the vendor panels and central `ywtc` pipeline add unnecessary
visual weight. Removing only those outlines will make the hierarchy cleaner
without changing the established artwork.

## What Changes

- Remove the red border around the Yandex Wiki panel.
- Remove the blue border around the Confluence panel.
- Remove the decorative outline immediately to the left and right of the
  central `ywtc` pipeline.
- Preserve the cover dimensions, composition, labels, logos, icons, colors,
  background, and all other visual details.
- Do not change runtime behavior, documentation text, or repository interfaces.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `project-maintenance`: Refine the required visual hierarchy of the README
  header by removing the three decorative framing elements.

## Impact

Only `docs/assets/readme-header.png` and the corresponding documentation
specification are affected. The edit is non-destructive to runtime data and has
no code, API, dependency, packaging, or migration behavior impact.

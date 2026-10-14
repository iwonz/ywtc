## Why

The current README illustration communicates document migration but does not identify the source and destination products at a glance. Clear Yandex Wiki and Confluence branding will make the tool's purpose immediately understandable.

## What Changes

- Edit the existing wide README cover so the left/source side carries a prominent, readable Yandex Wiki brand mark.
- Add a prominent, readable Confluence brand mark to the right/destination side while preserving the migration flow, document tree, attachments, tables, and overall aspect ratio.
- Inspect the generated image for brand recognition, text accuracy, composition, and README readability before replacing the current asset.
- Non-goals: no README layout change, no runtime behavior change, no additional remote assets, and no alteration of migration data.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `project-maintenance`: The required README header now visually identifies Yandex Wiki as source and Confluence as destination.

## Impact

- Replaces `docs/assets/readme-header.png` with an edited project-local raster asset.
- Updates the public documentation specification only; code, dependencies, credentials, reports, and remote systems are unaffected.

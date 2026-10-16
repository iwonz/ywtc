# Proposal

## Why

The content pipeline currently mistakes editor-only empty headings for meaningful source data and therefore writes a visible raw fallback for legitimately empty section pages. It also loses YFM layout boundaries before rendering, so column-based pages become a single vertical stream even though Confluence and HTML have safe native equivalents.

## What Changes

- Classify source content after provider normalization and treat pages containing only ignorable editor scaffolding as valid empty pages that can complete without fallback or raw snapshot.
- Introduce provider-neutral layout sections and cells before vendor transformation removes their boundaries.
- Preserve equal-column YFM layouts as Confluence page layouts, YFM layouts, and responsive HTML grids; preserve Confluence layouts in the reverse directions and report only unavoidable width/Markdown simplifications.
- Make the already-supported safe equivalents symmetric where both providers expose a stable representation: notes/callouts, cuts/expand, child navigation, task lists, code, anchors, links, images, and attachments.
- Include layout structure in semantic verification and report previews so a flattened or missing column is not silently accepted.
- Document the current native-equivalence matrix and the remaining static/fallback behavior without adding README sections.
- Release the functionality as `3.6.0` through the existing SemVer automation.

Non-goals: executing source scripts, installing optional vendor macros, preserving arbitrary CSS or exact pixel geometry, deleting obsolete raw snapshots, or weakening conflict and no-deletion guarantees.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `wiki-migration`: define semantic-empty page handling, provider-neutral layout preservation, symmetric safe native equivalents, and layout-aware verification.
- `static-export`: preserve layouts responsively in HTML and expose unavoidable Markdown layout simplification.
- `project-maintenance`: keep the supported-content and limitation tables aligned with the native-equivalence matrix.

## Impact

The change affects normalized content types, YFM and Confluence Storage parsing/rendering, verification fingerprints, migration fallback decisions, HTML/Markdown export styling, report previews, README fidelity documentation, and conversion/integration tests. It adds no CLI flags or configuration fields, performs no destination deletion, and keeps current state identity and resumability.

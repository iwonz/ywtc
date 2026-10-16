# Proposal

## Why

The current report repeats run metadata, devotes space to zero-value metrics, and wraps its main information in visually heavy card surfaces. The README also repeats operational rules across sections, while both transfer illustrations contain unnecessary arrows between the central content-class blocks.

## What Changes

- Replace the report's card-based overview and hierarchy with a flat, responsive presentation on the page background.
- Remove the visible report title, direction line, progress indicator, summary column headers, duplicate run ID, and result button.
- Present run metadata once in the fixed order Run ID, state, source, and destination, with safe source and destination links.
- Omit zero-value optional metrics and empty categories while retaining explicit non-numeric empty states when absence is operationally significant.
- Flatten definition and diagnostic surfaces inside the details dialog without removing the accessible modal, status treatment, search, filters, previews, localization, or virtualization.
- Remove only the small arrows between central transferable-content blocks from the README and transparent report illustrations.
- Tighten README prose without changing its fixed thirteen-section information architecture or complete public references.
- Do not change report JSON, state, migration behavior, public CLI commands, or destructive-operation boundaries.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `project-maintenance`: Clarify concise README ownership, arrow-free central transfer illustrations, and flat non-zero report presentation requirements.
- `wiki-migration`: Replace the progress-heavy report overview contract with a flat summary and one ordered metadata block while preserving accessible offline report behavior.

## Impact

Affected areas are the Mantine report application and its browser snapshots, README documentation, the two packaged PNG illustrations, presentation tests, and the project-maintenance and wiki-migration specifications. Runtime migration data, report contracts, state identity, provider adapters, and destination mutation behavior are unaffected.

# Proposal

## Why

Deterministic provider behavior is still sometimes reported as a destination conflict or incomplete transfer: generic error text can create `conflict`, source locator drift can abort discovery, and lossless static adaptations make otherwise complete pages `partial`. This produces blocked subtrees and warnings that do not reflect whether source information was actually preserved.

## What Changes

- Restrict `conflict` to typed, evidenced ambiguity of immutable destination ownership or identity.
- Reconcile revision races, title and resource-name collisions, locator drift, ambiguous upload responses, and missing derived state fields without text-based conflict inference.
- Replace the warning-plus-boolean content result with typed normalization, adaptation, and degradation notices.
- Keep pages complete when all source information is verified through a different presentation, including Grid snapshots, layout reshaping, and preserved external references.
- Add live state/export locking, semantic wizard configuration merging, and safe use of empty filesystem destinations.
- Report adaptations, degradations, normalizations, warnings, and real ownership conflicts as separate reconciled totals.
- Do not delete or overwrite unmapped destination objects, fetch external media, or weaken verification for missing source data.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `wiki-migration`: define typed ownership conflicts, deterministic collision reconciliation, information-completeness semantics, adaptations, identity drift handling, and concurrent state safety.
- `static-export`: distinguish lossless static adaptation from incomplete output and serialize concurrent export replacement.
- `workspace-management`: merge non-overlapping interactive configuration changes semantically.
- `project-maintenance`: document and validate the current adaptation, degradation, partial, and conflict semantics.
- `comment-archives`: reconcile archive revisions and attachment-name collisions without false conflicts or unnecessary partial outcomes.

## Impact

The normalized content and report contracts gain typed transformation notices and adaptation totals. Migration orchestration, provider adapters, resource/comment reconciliation, state/report persistence, wizard commit, filesystem export, README, tests, and generated report assets are affected. State additions remain optional and the automatic state identity and CLI surface do not change.

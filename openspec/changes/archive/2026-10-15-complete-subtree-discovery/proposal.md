# Proposal

## Why

`subtree` silently excludes accessible Yandex Wiki descendants because the client always requests only `actual` pages. Expanding discovery must also reconcile destination parents so rerunning an existing migration produces a complete, correctly nested tree instead of leaving formerly orphaned pages at the wrong level.

## What Changes

- Make `--source-status all|current` available to `migrate` and `doctor`, defaulting to every accessible structural descendant returned by the source hierarchy API.
- Enumerate and validate the complete subtree before destination mutation, with guarded pagination, exact selected/excluded accounting, and nearest-selected-ancestor projection.
- Reconcile mapped destination parent relationships top-down; move unchanged Confluence pages or safely remap through source-derived recreation where moving is unsupported, without deleting old content.
- Report discovery coverage, status exclusions, hierarchy gaps, and hierarchy repairs consistently in terminal, state run history, HTML/JSON reports, and the report catalog.
- Preserve the canonical state identity across source-status changes so an existing migration can expand without duplicates.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `wiki-migration`: complete subtree selection, source-status filtering, discovery integrity, hierarchy reconciliation, resumable expansion, and observable coverage.
- `project-maintenance`: document the new provider-neutral source status option without adding README sections.

## Impact

- Affects CLI parsing, source/destination adapter contracts, Yandex and Confluence clients, graph discovery, migration staging, state run metadata, reports, README, and contract/integration/browser tests.
- The default Yandex subtree grows to include accessible `obsolete` pages; operators can request the former current-only selection explicitly.
- No source or destination content is deleted, no credentials enter state or reports, and dry-run remains mutation-free.

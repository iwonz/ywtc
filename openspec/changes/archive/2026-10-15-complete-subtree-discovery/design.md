# Design

## Context

See `proposal.md` for motivation. Discovery currently asks Yandex only for `actual` descendants and returns `SourcePage[]`, so it cannot explain excluded pages or prove complete enumeration. Destination staging trusts a saved page ID without checking its parent, which leaves pages at an obsolete hierarchy position when a later run expands the source graph.

## Goals / Non-Goals

**Goals:**

- Freeze an auditable, complete source selection before writes.
- Keep one state identity while expanding or narrowing source status.
- Reconcile existing mapped hierarchy without weakening content-conflict protection.
- Keep all selected pages on the existing loss-aware content and resource pipeline.

**Non-Goals:**

- Discover pages the source API does not expose to the authenticated user.
- Delete stale, superseded, archived, trashed, or historical destination content.
- Treat Confluence archived/history content as structural descendants when its hierarchy API does not return it.

## Decisions

### Return structured discovery metadata from source adapters

`getDescendants` will accept `{status}` and return selected pages plus total/excluded identities, warnings, and effective capability notes. Yandex `all` uses one unfiltered paginated enumeration; `current` compares that enumeration with `actuality=actual`. Confluence filters response statuses when present and reports when its hierarchy endpoint only exposes current pages.

This is preferred over filtering in the graph because provider terminology and API calls remain isolated in adapters. The explicit root is resolved separately and always retained.

### Guard pagination and page-detail hydration as one preflight

The Yandex paginator will track cursors and immutable IDs, reject cursor cycles and conflicting slugs, and continue solely from `next_cursor`. Adapter hydration will use bounded client concurrency with settled results, then reject the entire selection with page-specific diagnostics if any selected detail fails. No destination write begins with a partial source tree.

### Preserve full ancestry in normalized pages

`SourcePage` will carry ordered ancestor IDs derived from provider breadcrumbs/ancestors. Graph projection chooses the closest selected ancestor and records an explicit gap when the immediate parent is unavailable or excluded. Slug/breadcrumb containment and unique canonical IDs become graph invariants before depth calculation.

### Separate status selection from canonical state identity

`sourceStatus` is stored on each run and report but excluded from the canonical endpoint identity, like scope. A broader run adds mappings; a narrower run ignores and reports unselected mappings without mutating them. Existing unversioned state remains readable by making historical run metadata default to `all` when absent rather than adding a schema-version branch.

### Reconcile parents before descendants

Destination staging already runs top-down and will compare each verified page's `parentId` with the expected destination parent. Content conflict validation runs before hierarchy mutation.

- Confluence Data Center updates `ancestors: [{id}]`; Cloud updates `parentId`. The adapter reads the page back and requires the new direct parent.
- Adapters without a safe move capability recreate the page with bootstrap content under the correct parent, retain the previous ID, reset resource destinations, and let the normal resource/final-render pipeline repopulate it.
- A failed or conflicting parent repair prevents that page from entering the destination page map, naturally blocking its descendants.

Moving and content update remain separate operations so a verified hierarchy checkpoint exists before child creation. Confluence attachments stay with the moved page; recreated pages reuse validated cache files.

### Use one selection summary across output surfaces

The graph carries source-selection metadata: requested/effective status, returned descendants, selected descendants, exclusions with reasons, maximum depth, gaps, and provider notes. Report summary, catalog, state counters, and terminal plan derive from it rather than recomputing counts.

## Risks / Trade-offs

- **Default migrations can become much larger** → show exact counts before mutation, retain `--source-status current`, and respect configured rate limits.
- **Status comparison adds a second Yandex enumeration for `current`** → default `all` remains a single enumeration; both paths use cursor pagination and deduplication.
- **Confluence move also relocates descendants** → only move state-owned, content-unchanged pages, process top-down, verify direct parents, and record every repair.
- **A non-movable destination leaves an old duplicate** → never delete it; mark its ID superseded in state/report and make the new mapped page authoritative.
- **Source tree can change during discovery** → immutable-ID conflicts or failed detail hydration abort before writes; a later rerun starts a new discovery snapshot.

## Migration Plan

1. Ship the new default and status option in `3.3.0`; no state conversion or new state identity is introduced.
2. A rerun with the existing state discovers missing pages, moves safe existing Confluence mappings, and creates only newly selected pages.
3. Rollback is the previous package version; destination objects remain valid because the change never deletes content and state checkpoints every verified mutation.

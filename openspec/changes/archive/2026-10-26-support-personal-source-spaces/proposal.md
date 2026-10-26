# Proposal

## Why

Personal Wiki pages already have ordinary page identities, but Confluence space URLs are rejected and homepage-only traversal omits independent branches. Operators need complete personal-space transfers with predictable scope, resumability, and honest counts.

## What Changes

- Accept personal Yandex page URLs and Confluence Data Center/Cloud space roots without new flags.
- Model spaces separately from pages, enumerate the complete space for subtree, and create one resumable destination container.
- Preserve all real-page content pipelines, scope/status filtering, references, retry, exports, and source-only mention scanning.
- Distinguish real source pages from the generated container in state, reporting, and documentation.
- Non-goals: copying blogs, user profiles, permissions, space settings, automatic private migrations, or deleting provider objects.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `wiki-migration`: typed page/space roots, personal URLs, full-space hierarchy, container identity and reporting.
- `static-export`: a generated index for space-root exports without inflated page totals.
- `mention-decisions`: shared personal-root discovery without resources or destination access.
- `targeted-run-retry`: stable space identity and separate container dependency recovery.
- `resumable-source-inventory`: real-page checkpoints under stable space-root identity.
- `project-maintenance`: personal-root documentation and package regressions.

## Impact

Provider clients, source selection, migration orchestration, state/report contracts, CLI summaries, report hierarchy, static exports, tests, and README. Existing page-root state identities and destination locator semantics remain unchanged. No new dependency or credential contract is required; release as a minor feature.

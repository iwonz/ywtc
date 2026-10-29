# Proposal

## Why

A completed discovery can become incomplete later when source permissions expand. Retry intentionally freezes its original membership, while a standalone subtree migration changes transfer identity and can create duplicate sections. Operators need a reviewed incremental synchronization that reuses established identities and repairs incoming links across the original transfer.

## What Changes

- Add `sync <run-id> [--source <subtree>]` and `sync apply <plan-id>` using the shared job service and local review UI.
- Discover newly accessible pages, compare independently versioned content/resource/comment/policy evidence, reuse equivalent results, and require update/keep/trash decisions for changed or unprovable baselines.
- Preserve transfer identity, immutable destination IDs, provider history and untouched content. Repair incoming links with minimal verified patches, including links from kept pages and archived comments.
- Persist Keep decisions until the source changes. Persist explicit trash exclusions so ordinary migration and retry cannot silently recreate them.
- Permit only separately confirmed, reversible trash of mapped published leaf pages when provider capabilities and read-back establish safety; never purge, delete children, or delete source data.
- Accept Confluence native ID/title normalization only after provider lookup proves the same immutable target.
- Keep existing migration/retry roles, configuration contracts, mention/hashtag policies and state IDs. Private runtime data and real migration details are not repository fixtures.

## Capabilities

### New Capabilities
- `migration-reconciliation`: reviewed incremental discovery, evidence, decisions, inbound reference repair and linked outcomes.

### Modified Capabilities
- `wiki-migration`: explicit trash exclusion boundaries and evidence-based native link verification.
- `targeted-run-retry`: preserve explicit exclusions and distinguish retry from discovery-expanding sync.
- `static-export`: reviewed managed export expansion retaining established paths and atomic replacement.
- `background-jobs`: shared durable sync analysis/application operations and progress.
- `local-control-center`: revision-checked sync review, diff, decisions and explicit application.
- `project-maintenance`: deterministic sync/privacy/package/browser coverage and canonical documentation.

## Impact

CLI parsing, operation preparation/execution, migration staging/finalization, optional state evidence and exclusions, provider capabilities, report contracts and the existing Mantine application. No new external service or runtime dependency is required. Real provider trash operations are not part of implementation validation; neutral fixtures cover that behavior.

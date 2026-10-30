# Proposal

## Why

The workspace action can overflow its sidebar, the repository link uses a generic branch symbol, and empty sections look unfinished. Operators need consistent action affordances and intentional empty states that explain the next step without pretending loading or failed reads are empty results.

## What Changes

- Use the genuine GitHub mark as the rightmost header control, preserving explicit isolated navigation.
- Fix shared icon/label button composition and audit visible actions for thematic leading icons, wrapping, focus and narrow layouts.
- Remove the redundant workspace-folder caption.
- Give connections, reports, tasks, synchronization and mention/hashtag sections distinct local project-style illustrations, concise explanations and useful actions when genuinely empty.
- Distinguish loading, failed reads and filtered no-results; hide empty pagination.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `local-control-center`: branded navigation, resilient action layout and illustrated empty-workspace guidance.

## Impact

Shared shadcn button composition, web shell and work areas, bundled static illustration assets, build/package verification, browser fixtures, visual baselines, license attribution and canonical operator guidance. No new dependencies, API/config/CLI contracts, provider mutations, migration execution, destructive operations or state changes.

# Proposal

## Why

Operators need a copyable way to reopen the exact report produced by a run. A resumed live migration must also recover when a previously mapped destination subtree was deleted; currently a failed title lookup can prevent root recreation and block the entire selected hierarchy.

## What Changes

- Accept `last` as an explicit alias for the newest valid report in `ywtc reports open` while retaining the existing omitted-ID behavior.
- Print the report run ID and an exact `ywtc reports open <run-id> --workdir <path>` command whenever a migration writes a report, including failure results.
- Use a parent-scoped Confluence Data Center child lookup when recovering a missing mapped page.
- Use that parent-scoped lookup for ordinary direct-child collision checks as well, avoiding a false space-wide `404` before page creation.
- Treat recovery lookup failure as a recorded retryable warning rather than skipping bootstrap page creation when the expected parent is confirmed.
- Recreate a missing root first, then restore descendants beneath their recovered parents while retaining prior destination IDs and resetting stale resource mappings.
- Accept provider serialization changes during the same run only when semantic content remains identical, and continue to reject meaningful concurrent edits.
- Reconcile deterministic raw-source snapshots with existing destination attachments by ID, name, size, and hash before upload.
- Add regression coverage for deleted subtrees, lookup failures, report aliases, terminal guidance, and non-destructive state recovery.
- Do not delete destination content, adopt an unverified candidate, or weaken conflict detection.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `wiki-migration`: strengthen terminal report access and recovery of a confirmed destination mapping after its page or subtree has been removed.

## Impact

- CLI parsing, report selection, and migration completion output.
- Confluence Data Center child discovery, provider-neutral destination recovery, semantic write consistency, and source-snapshot reconciliation.
- Migration/report tests, README command documentation, and the `wiki-migration` specification.

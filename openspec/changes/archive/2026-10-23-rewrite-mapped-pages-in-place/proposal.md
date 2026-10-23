# Proposal

## Why

Operators need to rebuild migrated content from current source data without losing immutable destination IDs, incoming links, attachments, or children. `--fresh` discards mappings and is unsuitable for this recovery operation; ordinary reruns may reuse inventory and skip semantically identical writes.

## What Changes

- Add `migrate --rewrite` (`-R`) and `retry --rewrite` to refresh selected source inventory and force verified in-place updates of mapped remote pages.
- Require existing mappings and fail safely when a mapped page cannot be confirmed or hierarchy repair would require replacement; never create a page in rewrite mode.
- Reject rewrite combined with fresh or filesystem export, preserve the option in invocation evidence and continuation commands, and retain ordinary migration/retry defaults.
- Document the distinction between ordinary resume, identity-preserving rewrite, and fresh mappings.
- Perform the requested migration-specific recovery through an untracked workspace script using existing adapters, a full-source mention scan, backups, a targeted plan, and ordinary reports.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `wiki-migration`: explicit identity-preserving rewrite and no-create safety boundary.
- `resumable-source-inventory`: forced current-source inventory without clearing destination mappings.
- `targeted-run-retry`: optional rewrite of the existing actionable selection.

## Impact

CLI parsing, command dispatch and wizard prefill, migration staging/update, invocation validation, retry restoration, tests, package smoke checks, README, and current specifications. No dependency or state identity change. No deletions, implicit adoption of unrelated pages, suppressed verification, or migration-specific data in tracked files. Whole-run repair selection remains a temporary operator script, not a new public command.

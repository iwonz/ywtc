# Proposal

## Why

Large source trees currently lose all practical preflight progress when one late resource-inventory request exhausts ordinary HTTP retries. A transient provider failure can therefore repeat hours of successful read-only work even though destination mutation was correctly prevented.

## What Changes

- Persist an isolated source-inventory snapshot per canonical migration state, with atomic per-page checkpoints for discovery details, resources, normalized content, and comments.
- Resume an unfinished or dry-run snapshot only when its source identity, scope, status filter, comment policy, and current enumerated immutable page set remain compatible; `--fresh` starts a new snapshot.
- Retry only retryable discovery or inventory failures in bounded recovery rounds with decreasing concurrency and provider cooldowns before failing the preflight barrier.
- Classify inventory failures by exact operation (`page-detail`, `attachments-list`, `grids-list`, `grid-read`, `comments-read`, or normalization) and retain structured HTTP status, attempts, and safe endpoint context.
- Show checkpoint reuse, inspected/remaining counts, recovery progress, and the precise final root cause in terminal output and reports.
- Keep destination mutation forbidden until the selected source inventory is complete. Never silently omit a failed page, resource collection, or comment archive.

## Capabilities

### New Capabilities

- `resumable-source-inventory`: Durable source snapshot checkpoints, selective recovery, compatibility validation, and exact inventory diagnostics for large transfers.

### Modified Capabilities

- `wiki-migration`: Reliability, reporting, and preflight behavior now preserve and selectively resume successful source inventory work before destination mutation.

## Impact

- Affects source discovery adapters, the migration preflight pipeline, ignored runtime cache files, typed issues, progress output, reports, and state-associated cache cleanup.
- Adds no CLI flag, configuration field, dependency, state identity component, destination deletion, or compatibility path.
- Runtime source content remains confined to the ignored workdir cache and is excluded from Git and npm packages.

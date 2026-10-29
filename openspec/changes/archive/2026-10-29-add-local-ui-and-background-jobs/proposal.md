# Proposal

## Why

Large migrations need durable execution and an operator interface independent of a terminal or browser connection. Existing migration, report and decisions code can provide one consistent local control center without duplicating provider behavior.

## What Changes

- Ship a loopback-only Next.js/Mantine application through `ywtc ui`, including workspace/profile setup, migration/report/state inspection and live progress.
- Run migration, retry and source-only exports through a per-workspace durable FIFO job service; expose background submission and job inspection/cancellation in CLI.
- Add typed, replayable progress rather than parsing terminal output.
- Add preview-bound manual object selection and source-authoritative in-place decisions application, retaining the existing automatic retry boundary.
- Share source scanning and decisions editing, with drafts, immutable revisions and explicit workspace activation.
- Preserve existing state identity, JSON decision formats, dry-run safety and offline reports. No provider deletion, forced ownership takeover, automatic crash retry, remote server mode or real migration is included.

## Capabilities

### New Capabilities

- `background-jobs`: private durable queue, detached execution, lifecycle, replay and cancellation.
- `local-control-center`: packaged authenticated loopback application, operator workflows and filesystem boundaries.

### Modified Capabilities

- `targeted-run-retry`: explicit preview-bound manual selection and decisions-only in-place updates.
- `workspace-management`: browser setup and explicit revisioned mapping activation.
- `mention-decisions`: combined analysis and revision-safe decision editing.
- `hashtag-decisions`: combined analysis and revision-safe decision editing.
- `project-maintenance`: packaged web/worker assets, deterministic checks and current operator reference.

## Impact

CLI dispatch and command schemas, migration progress and targeted planning, source scanning, workspace configuration, report projections, package builds and verification are affected. Next.js 16.4.3 is a build dependency; ordinary CLI execution must not load it. Runtime artifacts remain private under the selected workspace's `.states/`. This is an additive minor release after 5.2.0.

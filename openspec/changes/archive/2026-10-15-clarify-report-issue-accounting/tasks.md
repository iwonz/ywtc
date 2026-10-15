# Tasks

## 1. Current-run outcome accounting

- [x] 1.1 Carry remote staging failures into the final page row and verify existing-state dry-runs never restore stale complete or partial statuses.
- [x] 1.2 Override every dry-run resource outcome to planned with zero transferred bytes and verify failure branches remain fully reconciled.

## 2. Exact issue categories

- [x] 2.1 Separate warnings from degradations in report data and final status selection; verify unit tests assert disjoint counts.
- [x] 2.2 Show warning and degradation totals independently in terminal completion and `reports list`, and keep invalid-bundle diagnostics concise; verify catalog and CLI tests agree with report JSON.

## 3. Integration verification

- [x] 3.1 Repeat the representative real read-only dry-run and verify page/resource status sums, zero transferred bytes, and issue category totals programmatically.
- [x] 3.2 Run `npm run check` and strict OpenSpec validation, fixing failures without weakening quality gates.

## Workflow follow-up

- Archive the change after every tracked task passes.
- Run strict specification validation after archival.
- Fetch and compare `origin/master`, then commit and push without force.

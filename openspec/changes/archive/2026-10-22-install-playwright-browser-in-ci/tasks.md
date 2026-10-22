# Tasks

## 1. CI browser provisioning

- [x] 1.1 Add release workflow contract tests for Chromium provisioning and command ordering in the matrix and publication jobs; verify the focused Vitest case fails before the workflow edit
- [x] 1.2 Provision the lockfile-compatible Chromium browser and Linux dependencies in both browser-bearing jobs; verify the focused release tests pass

## 2. Integrated verification

- [x] 2.1 Run `npm run check` and verify all static, unit, browser, build, package, security, and OpenSpec checks pass

## Workflow follow-up

- Archive the change after all tracked tasks pass.
- Run strict OpenSpec validation after archival.
- Push the Conventional Commit and verify the clean GitHub Actions quality gates.

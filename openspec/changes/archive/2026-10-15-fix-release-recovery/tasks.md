# Tasks

## 1. Release metadata validation

- [x] 1.1 Accept Release Please linked/date headings and legacy dash/date headings while rejecting missing, malformed, or wrong-version entries; verify focused Vitest cases pass.
- [x] 1.2 Update the release-management delta and maintainer documentation to describe the supported release and recovery behavior; verify commands and channel expectations match the workflow.

## 2. Tagged release recovery

- [x] 2.1 Make manual dispatch load current release-control tooling from a single trusted `origin/master` snapshot, restore tagged files before pack, and verify workflow assertions cover the recovery path and least-privilege permissions.
- [x] 2.2 Normalize npm 11/12 `npm pack --json` results in package verification and artifact selection; verify the package smoke-test succeeds under npm 12.
- [x] 2.3 Run `npm run check` under the supported Node runtime and resolve every failure without weakening checks.

## Workflow follow-up

- Archive the change and rerun strict OpenSpec validation.
- Commit and push the maintenance fix after rechecking `origin/master`.
- Dispatch recovery for `v2.0.0` and verify GitHub, npm/npx, release assets, and Homebrew end to end.

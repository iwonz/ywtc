## Why

GitHub now reports that `actions/checkout@v4` and `actions/setup-node@v4` run on a deprecated Node.js 20 action runtime. The release workflow should use current maintained major versions consistently with the project's Node.js 24 baseline.

## What Changes

- Update `actions/checkout` and `actions/setup-node` from v4 to v7.
- Update `googleapis/release-please-action` from v4 to v5.
- Keep permissions, inputs, release behavior, and the Node.js test matrix unchanged.

## Capabilities

### Modified Capabilities

- `project-maintenance`: require maintained JavaScript action runtimes in CI.

## Impact

Only `.github/workflows/release.yml`, its contract test, and maintenance specifications change. Product runtime and migration behavior are unaffected.

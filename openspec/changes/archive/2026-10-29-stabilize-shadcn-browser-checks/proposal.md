# Proposal

## Why

The shadcn rollout passes local checks but Linux CI exposed host-dependent typography and session-dependent browser fixtures. The floating current Node alias also selected an unsupported alpha release, breaking Next.js and PNG decoding rather than testing a supported stable runtime.

## What Changes

- Keep browser sessions independent across test retries and isolated scenarios.
- Make report typography deterministic across supported hosts without relaxing visual thresholds.
- Test the minimum and current stable Node majors explicitly, excluding prerelease runtimes from publication gates.
- Preserve unrelated route/worker names when removing the build checkout path from standalone assets.
- Preserve all UI interactions, security boundaries and migration contracts. No real provider operations, content deletion, state changes or schema changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `project-maintenance`: strengthen deterministic browser and stable-runtime quality gates.

## Impact

Report/shared typography, browser fixtures, workflow runtime matrix and related tests. The patch joins the pending shadcn release; README operator commands are unchanged.

# Proposal

## Why

Homebrew recovery now reaches formula verification, but current Homebrew rejects the generated formula for non-canonical component order and a custom npm install command. The generator must emit the supported Node formula API so audit, installation, and publication can finish.

## What Changes

- Emit formula metadata in Homebrew's required component order.
- Install the npm package using `std_npm_args` and standard `libexec` bin linking.
- Strengthen generator tests against the rejected legacy command and expected canonical output.
- Re-run recovery until the formula passes style, strict audit, install, test, and version checks.
- Do not weaken audit, skip installation tests, change the npm artifact, or force-push the formula commit.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `release-management`: Require generated formulas to use the supported Homebrew Node/npm installation contract.

## Impact

- Affects the Homebrew formula generator, its tests, and the release-management specification.
- Does not alter ywtc runtime behavior, npm publication, GitHub tags, or migration data.

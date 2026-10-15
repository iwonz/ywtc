## Why

Homebrew correctly applies a one-day npm release cooldown during formula installation, but the published package pins two dependencies released only hours earlier. Strict audit passes, yet installation fails; the patch release must use tested cooldown-eligible dependencies instead of weakening Homebrew's supply-chain protection.

## What Changes

- Pin `@diplodoc/transform` to tested `4.78.6` and `dotenv` to tested `18.0.7`; both are the closest preceding releases that satisfy the one-day npm cooldown.
- Keep Homebrew's standard `std_npm_args` and full release-age protection unchanged.
- Verify the dependency graph with the cooldown enabled and run the complete project/package test matrix.
- Do not add permanent package exceptions, relax security gates, alter user data, or change CLI behavior.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `release-management`: Require the published runtime dependency graph to install under Homebrew's standard npm release cooldown before formula publication.

## Impact

- Updates `package.json`, `package-lock.json`, the release-management contract, and dependency regression coverage.
- Produces a patch release; no public API, state, provider, or content conversion behavior changes.

# Proposal

## Why

Homebrew now refuses to load formulae from non-official taps unless the exact formula or tap is trusted. The release workflow stages `Formula/ywtc.rb` in an isolated CI tap but does not trust that tap, so every automatic or recovery release fails before audit, installation, and final completion verification.

## What Changes

- Explicitly trust only the ephemeral `iwonz/ywtc-ci` tap after it is created and before any formula-loading verification command.
- Add a workflow contract regression test that enforces tap creation, candidate staging, scoped trust, and verification ordering.
- Recover the existing `v5.4.7` release and require Homebrew publication plus the final completion gate to pass.
- Do not disable Homebrew trust enforcement, trust arbitrary taps, bypass audit/install/test checks, move the existing tag, or republish the existing npm version.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `release-management`: Require the isolated Homebrew verification tap to be explicitly and narrowly trusted before CI loads its staged formula.

## Impact

Affected files are `.github/workflows/release.yml`, focused release workflow tests, release-management specifications, and the archived OpenSpec record. Runtime migration behavior, public CLI contracts, and release credentials are unchanged.

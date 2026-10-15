## Why

Homebrew 7 refuses to load formulas from non-official taps until the operator explicitly trusts the tap. The published formula is valid, but the documented two-command installation fails on current Homebrew, so every public installation surface must include the required trust step.

## What Changes

- Add `brew trust --tap iwonz/ywtc` between tap registration and installation in README and generated GitHub release notes.
- Explain that explicit trust authorizes formulas from this repository and is required by current Homebrew for third-party taps.
- Cover the public command sequence in release regression tests.
- Do not auto-trust a repository from application code, weaken formula verification, or change user content and migration behavior.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `release-management`: Require public Homebrew installation guidance to include the explicit third-party tap trust step used by current Homebrew.

## Impact

- Affects README installation documentation, generated GitHub release installation notes, tests, and release-management specification.
- Requires a patch release so npm's rendered README and every distribution channel present the same working command sequence.

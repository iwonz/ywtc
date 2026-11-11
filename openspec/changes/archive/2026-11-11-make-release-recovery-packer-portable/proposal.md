# Proposal

## Why

The `v5.4.7` recovery workflow loaded the audited packer into a temporary directory outside the repository package boundary, where `tsx` treated it as CommonJS and rejected its top-level `await`. Recovery therefore failed before it could reuse the already published npm version and complete Homebrew/final verification.

## What Changes

- Make the release packing entry point executable both inside the ESM repository and from the temporary recovery-tool directory.
- Add a regression test that runs a copied packer beside a temporary shared-helper stub, reproducing the recovery module boundary.
- Complete and verify recovery for the existing `v5.4.7` tag after the fix reaches `master`.
- Do not create, move, or republish the existing tag/npm version, and do not bypass package or Homebrew verification.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `release-management`: Require the audited recovery packer entry point to execute outside the repository ESM package boundary while operating on unchanged tagged source.

## Impact

Affected files are `scripts/pack-release.ts`, focused release tests, release-management specifications, and the archived OpenSpec record. Runtime migration behavior and public CLI contracts are unchanged.

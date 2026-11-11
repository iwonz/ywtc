# Proposal

## Why

Authorized recovery repacks immutable tagged source and overwrites the GitHub archive even when npm already contains that version. npm pack output is not byte-reproducible, so the replacement asset can differ from the published registry tarball and make the cross-channel completion gate fail after otherwise successful recovery.

## What Changes

- After publication or existing-version detection, download the exact npm registry tarball through the bounded registry handoff and use those bytes for the GitHub archive and checksum.
- Load the current registry-handoff tool during manual recovery so older immutable tags receive the same audited repair behavior.
- Add workflow contract coverage for pack, publish-or-reuse, registry download, checksum, and GitHub upload ordering.
- Repair `v5.4.7` assets idempotently and require the final completion gate to pass.
- Do not move or recreate the tag, republish an existing npm version, weaken artifact validation, or accept mismatched digests.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `release-management`: Require GitHub release assets and checksums to use the byte-identical downloadable npm registry tarball for both fresh publication and recovery.

## Impact

Affected files are `.github/workflows/release.yml`, focused release workflow tests, release-management specifications, and the archived OpenSpec record. Package contents, version identity, publication credentials, Homebrew formula generation, and runtime migration behavior are unchanged.

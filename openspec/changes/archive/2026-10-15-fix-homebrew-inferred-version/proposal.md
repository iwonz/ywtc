## Why

Current Homebrew strict audit rejects the generated formula because its explicit `version` stanza duplicates the version Homebrew scans from the npm registry tarball URL. The release cannot publish a verified formula until generation follows that canonical inference behavior.

## What Changes

- Omit the redundant `version` stanza from generated Homebrew formulas.
- Continue validating the requested SemVer and use the version-bearing npm tarball URL as Homebrew's version source.
- Add regression coverage that requires inferred version metadata while preserving standard npm installation and CLI tests.
- Do not alter npm/GitHub artifacts, product runtime behavior, user data, or any destination content.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `release-management`: Require generated formulas to let Homebrew infer the release version from the registry URL without redundant version metadata.

## Impact

- Affects `scripts/homebrew-formula.ts`, its unit test, and the Homebrew release specification.
- No dependency, public CLI, provider, workspace, state, or migration behavior changes.

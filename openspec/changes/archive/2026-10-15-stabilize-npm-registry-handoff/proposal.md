# Proposal

## Why

npm trusted publishing can complete before the newly published package version becomes readable from every registry endpoint. The Homebrew job currently performs a single immediate lookup, so an otherwise successful release can fail with a transient `E404` and require manual recovery.

## What Changes

- Wait for the exact published version and its registry tarball URL with bounded retry and backoff before generating the Homebrew formula.
- Validate that the registry response is non-empty, version-specific, and downloadable before continuing.
- Emit attempt-level progress and a final actionable timeout error instead of exposing a raw transient npm failure.
- Add workflow contract tests for retry bounds, successful handoff, and diagnostic behavior.
- Keep npm publication idempotent and preserve the existing manual recovery path.
- Do not republish versions, weaken Homebrew verification, store credentials, or modify any package, release, or formula after a failed bounded wait.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `release-management`: Require a bounded, observable registry-availability handoff between npm publication and Homebrew formula generation.

## Impact

- `.github/workflows/release.yml`
- A release-only npm registry handoff helper under `scripts/`
- Release workflow and helper tests under `tests/`
- `release-management` specification
- GitHub Actions, npm registry metadata, and the same-repository Homebrew tap

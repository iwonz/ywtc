# Proposal

## Why

Manual recovery now publishes npm and GitHub artifacts successfully, but GitHub skips the downstream Homebrew job because Release Please is intentionally skipped during `workflow_dispatch`. Recovery must treat a successful publication job as the direct and sufficient prerequisite for formula repair.

## What Changes

- Run Homebrew verification/publication whenever its direct `publish-npm` dependency succeeds, including manual recovery.
- Keep Homebrew skipped when npm/GitHub publication fails or is skipped.
- Add a workflow regression assertion and complete the interrupted `v2.0.0` formula publication.
- Do not republish npm versions, move tags, bypass Homebrew audit/tests, or force-push `master`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `release-management`: Clarify that successful manual recovery continues through Homebrew even though Release Please is skipped.

## Impact

- Affects the Homebrew job condition, release workflow tests, and the release-management specification.
- Does not change CLI behavior, package contents, credentials, or source/destination data.

# Proposal

## Why

The repository correctly created a `5.4.7` Release Please pull request after the release-producing source commit, but the task was treated as complete after pushing `master`. Because publication is deliberately two-phase, the package version, GitHub Release, npm registry, and Homebrew formula correctly remained at `5.4.6`; the process lacks an executable final completion gate and an explicit agent handoff contract.

## What Changes

- Define a release as incomplete until the Release Please pull request is reviewed and merged and the resulting workflow verifies GitHub tag/release metadata, release assets, npm metadata/tarball, and the committed Homebrew formula for one exact version.
- Add a deterministic release-completion verifier with unit coverage for missing, mismatched, and complete channel state.
- Add a final read-only workflow job after npm/GitHub publication and Homebrew publication; a release workflow succeeds only when the cross-channel verifier passes.
- Update contributor and operator guidance so a requested release is never reported complete after only a source push or release-PR creation.
- Complete the already proposed `5.4.7` through the existing Release Please flow after this change is audited and pushed.
- Do not manually create or move tags, bypass the Release Please metadata review, republish an existing npm version, weaken channel validation, or store publication credentials.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `release-management`: add an end-to-end completion contract and a final cross-channel verification gate for automatic and recovery releases.

## Impact

- `.github/workflows/release.yml`: final release-completion job.
- `scripts/release-completion.ts`, `package.json`: reusable verifier and command.
- `tests/release.test.ts`: red/green regression coverage for channel validation, workflow ordering, and documentation.
- `README.md`, `AGENTS.md`: canonical operator and agent completion rules.
- `openspec/specs/release-management/spec.md`: synchronized observable release contract after archival.
- No migration runtime, provider API, user data, destination mutation, deletion, purge, or manual-tag behavior changes.

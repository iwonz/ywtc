## Why

`ywtc` has a public repository and package version but no tags, changelog, GitHub Releases, or reproducible publication workflow. A SemVer-based release process is required so users can identify stable versions, inspect changes, verify artifacts, and receive predictable future updates.

## What Changes

- Add GitHub Actions checks for pull requests, `master`, and release tags.
- Use Release Please with Conventional Commits to propose SemVer version bumps and maintain `CHANGELOG.md`, `package.json`, `package-lock.json`, and the release manifest.
- Create `vX.Y.Z` GitHub Releases and attach the packed CLI plus its SHA-256 checksum after the full quality gate passes.
- Validate manually created release tags against strict SemVer, repository version metadata, changelog, and version ordering.
- Document the release lifecycle, commit-to-version mapping, required repository settings, initial `v1.0.0` bootstrap, and recovery steps.
- Extend agent instructions so feature work uses Conventional Commits and generated release metadata remains distinct from product changes that require OpenSpec.

## Capabilities

### New Capabilities

- `release-management`: SemVer calculation, validation, GitHub Release publication, artifacts, and release safety.

### Modified Capabilities

- `project-maintenance`: add concise public release documentation and repository contribution rules.

## Impact

- Adds `.github/workflows/release.yml`, Release Please configuration and manifest, `CHANGELOG.md`, a release-tag validator with tests, and README/AGENTS guidance.
- Uses the repository-provided `GITHUB_TOKEN` with scoped workflow permissions; no new long-lived secret is required for normal publication.
- GitHub Releases are published; npm registry publication is explicitly out of scope.
- Release automation does not modify Yandex Wiki, Confluence, migration state, reports, credentials, or runtime behavior.
- The current `1.0.0` codebase is bootstrapped once as tag and GitHub Release `v1.0.0`; subsequent releases use the Release Please pull-request flow.

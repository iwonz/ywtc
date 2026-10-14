# release-management Specification

## Purpose
TBD - created by archiving change automate-semver-github-releases. Update Purpose after archive.
## Requirements
### Requirement: SemVer release calculation
The repository SHALL use Conventional Commits and Release Please to calculate stable Semantic Versioning releases from changes merged into `master`.

#### Scenario: Backward-compatible feature
- **WHEN** unreleased history contains a `feat` commit and no breaking change
- **THEN** the release proposal SHALL increment the minor version

#### Scenario: Backward-compatible correction
- **WHEN** unreleased history contains only release-producing `fix`, `perf`, or `revert` commits
- **THEN** the release proposal SHALL increment the patch version

#### Scenario: Breaking change
- **WHEN** an unreleased commit uses `!` in its Conventional Commit type or contains a `BREAKING CHANGE` footer
- **THEN** the release proposal SHALL increment the major version

#### Scenario: Non-product maintenance
- **WHEN** unreleased history contains only documentation, test, build, CI, or chore commits without a breaking-change marker
- **THEN** no new product release SHALL be proposed

### Requirement: Reviewable release metadata
The system SHALL maintain release version, changelog, and release manifest changes in a reviewable Release Please pull request before publication.

#### Scenario: Release proposal is updated
- **WHEN** release-producing commits reach `master`
- **THEN** Release Please SHALL create or update one release pull request containing synchronized `CHANGELOG.md`, `package.json`, `package-lock.json`, and `.release-please-manifest.json` versions

#### Scenario: Release proposal is not merged
- **WHEN** the release pull request remains open
- **THEN** the repository SHALL NOT create its release tag or GitHub Release

### Requirement: Verified GitHub publication
The repository SHALL publish a release only after the tagged revision passes the complete project quality gate and its tag, package metadata, lockfile, and changelog agree on a valid increasing SemVer version.

#### Scenario: Release Please pull request is merged
- **WHEN** a valid Release Please pull request is merged into `master`
- **THEN** the workflow SHALL create a `vX.Y.Z` Git tag and GitHub Release with generated release notes

#### Scenario: Tag metadata is inconsistent
- **WHEN** a release tag is malformed, is not greater than prior release tags, or differs from package, lockfile, or changelog metadata
- **THEN** publication SHALL fail with a corrective error before creating or modifying a GitHub Release

#### Scenario: Quality gate fails
- **WHEN** `npm run check` fails for the candidate revision
- **THEN** neither automatic release processing nor manual tag publication SHALL proceed

### Requirement: Verifiable release artifacts
Each GitHub Release SHALL include a packed `ywtc` npm archive and a SHA-256 checksum while the project remains unpublished to the npm registry.

#### Scenario: Release artifact is produced
- **WHEN** a GitHub Release is created from a valid release revision
- **THEN** the workflow SHALL run `npm pack`, attach the resulting `ywtc-<version>.tgz`, and attach a matching `.sha256` file

#### Scenario: Existing release is retried
- **WHEN** an authorized workflow reruns publication for an existing tag
- **THEN** it SHALL update only that tag's release artifacts without creating another version or publishing to npm

### Requirement: Least-privilege release automation
Release workflows SHALL use scoped GitHub Actions permissions and SHALL NOT require vendor migration credentials or a repository-stored long-lived publication token for the standard flow.

#### Scenario: Pull request checks run
- **WHEN** CI evaluates an untrusted pull request
- **THEN** the workflow SHALL have read-only repository contents permission and SHALL NOT expose write credentials

#### Scenario: Release automation writes GitHub state
- **WHEN** Release Please or tagged publication requires a pull request, tag, release, or asset update
- **THEN** only the corresponding trusted job SHALL receive `contents`, `issues`, and/or `pull-requests` write permissions through `GITHUB_TOKEN`

### Requirement: Initial release bootstrap
The repository SHALL provide a one-time validated path to publish the existing `1.0.0` baseline without reinterpreting pre-automation history as a new version.

#### Scenario: Initial tag is pushed
- **WHEN** annotated tag `v1.0.0` points to the release-enabled revision and matches package, lockfile, manifest, and changelog metadata
- **THEN** the tag workflow SHALL publish GitHub Release `v1.0.0` and its verified artifacts

#### Scenario: Future release history is evaluated
- **WHEN** Release Please evaluates commits after the bootstrap baseline
- **THEN** it SHALL ignore earlier repository history and calculate only changes after the configured bootstrap boundary or latest release tag

# release-management Specification

## Purpose
TBD - created by archiving change automate-semver-github-releases. Update Purpose after archive.
## Requirements
### Requirement: SemVer release calculation
The repository SHALL use Conventional Commits and Release Please to calculate stable Semantic Versioning releases from changes merged into `master`, include all recognized meaningful commit types in categorized changelog and GitHub notes, and allow only `feat`, `fix`, `perf`, `revert`, or breaking changes to trigger a product version.

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
- **WHEN** unreleased history contains only documentation, test, build, CI, refactor, style, or chore commits without a breaking-change marker
- **THEN** no new product release SHALL be proposed, while those commits SHALL appear in the next release notes when a product change exists

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
Each GitHub Release SHALL publish `@iwonz/ywtc` to npm with OIDC provenance and include the exact packed npm archive plus SHA-256 checksum after validation.

#### Scenario: Release artifact is produced
- **WHEN** a GitHub Release is created from a valid release revision
- **THEN** the workflow SHALL publish the public scoped package without a long-lived npm token, attach its versioned registry-compatible archive and checksum, and include verified npm, npx, and Homebrew installation commands in release notes

#### Scenario: Existing release is retried
- **WHEN** an authorized workflow reruns publication for a version already present on npm
- **THEN** it SHALL verify the existing registry version and repair only missing GitHub artifacts, notes, or formula state without attempting an illegal duplicate npm publication

### Requirement: Least-privilege release automation
Release workflows SHALL use scoped GitHub Actions permissions, npm trusted publishing bound to `.github/workflows/release.yml`, and SHALL NOT require vendor migration credentials or a repository-stored long-lived npm publication token.

#### Scenario: Pull request checks run
- **WHEN** CI evaluates an untrusted pull request
- **THEN** the workflow SHALL have read-only repository contents permission and SHALL NOT expose write or publication credentials

#### Scenario: npm publication runs
- **WHEN** a validated Release Please release is created
- **THEN** only the publication job SHALL receive `id-token: write` and the GitHub permissions required for release artifacts

#### Scenario: Formula maintenance runs
- **WHEN** the npm package and release assets are verified
- **THEN** only the trusted Homebrew job SHALL receive `contents: write` to commit the generated formula to current `master`

### Requirement: Initial release bootstrap
The repository SHALL document and support a one-time interactive owner publication of `@iwonz/ywtc@0.0.0` under the `bootstrap` dist-tag followed by `npm trust github` binding before the first OIDC release.

#### Scenario: Package does not exist
- **WHEN** the scoped package has not yet been created in npm
- **THEN** owner `iwonz` SHALL publish the minimal validated bootstrap package with interactive 2FA and no repository token

#### Scenario: Trusted publisher is configured
- **WHEN** the bootstrap package exists and the release workflow is present on `master`
- **THEN** the owner SHALL bind `iwonz/ywtc` and `release.yml` with `--allow-publish` and complete the first OIDC release within the trust-command validity window

### Requirement: Same-repository Homebrew distribution
The release workflow SHALL generate and maintain `Formula/ywtc.rb` in `iwonz/ywtc` from the published npm archive so macOS operators can use an explicit same-repository tap.

#### Scenario: Formula generation
- **WHEN** npm version `X.Y.Z` is available
- **THEN** automation SHALL obtain the registry tarball URL and SHA-256, generate a Node formula for `ywtc`, and avoid embedding credentials or local paths

#### Scenario: Formula verification
- **WHEN** a formula candidate is generated
- **THEN** macOS CI SHALL run Homebrew style, audit, install, and functional CLI tests before updating `master`

#### Scenario: Formula publication
- **WHEN** formula verification succeeds
- **THEN** automation SHALL fast-forward current `master`, create commit `chore(homebrew): update formula to vX.Y.Z`, and push without force so `brew update` and `brew upgrade ywtc` discover it

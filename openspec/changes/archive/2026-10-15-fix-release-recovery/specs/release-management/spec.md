# release-management Delta

## MODIFIED Requirements

### Requirement: Verified GitHub publication
The repository SHALL publish a release only after the tagged revision passes the complete project quality gate and its tag, package metadata, lockfile, and a dated Release Please-compatible changelog heading agree on a valid increasing SemVer version.

#### Scenario: Release Please pull request is merged
- **WHEN** a valid Release Please pull request is merged into `master`
- **THEN** the workflow SHALL create a `vX.Y.Z` Git tag and GitHub Release with generated release notes

#### Scenario: Linked Release Please changelog heading
- **WHEN** `CHANGELOG.md` contains `## [X.Y.Z](comparison-url) (YYYY-MM-DD)` for the release version
- **THEN** release metadata validation SHALL accept the heading as dated and version-matched

#### Scenario: Legacy changelog heading
- **WHEN** `CHANGELOG.md` contains `## [X.Y.Z] - YYYY-MM-DD` for the release version
- **THEN** release metadata validation SHALL accept the heading for existing and manually maintained changelog history

#### Scenario: Tag metadata is inconsistent
- **WHEN** a release tag is malformed, is not greater than prior release tags, differs from package or lockfile metadata, or lacks an accepted dated changelog heading
- **THEN** publication SHALL fail with a corrective error before publishing npm or release artifacts

#### Scenario: Quality gate fails
- **WHEN** `npm run check` fails for the candidate revision
- **THEN** neither automatic release processing nor manual tag publication SHALL proceed

### Requirement: Verifiable release artifacts
Each GitHub Release SHALL publish `@iwonz/ywtc` to npm with OIDC provenance and include the exact packed npm archive plus SHA-256 checksum after validation. An authorized recovery SHALL preserve the tagged source while using current trusted release-control validation compatible with the active npm CLI.

#### Scenario: Release artifact is produced
- **WHEN** a GitHub Release is created from a valid release revision
- **THEN** the workflow SHALL publish the public scoped package without a long-lived npm token, attach its versioned registry-compatible archive and checksum, and include verified npm, npx, and Homebrew installation commands in release notes

#### Scenario: Existing release is retried
- **WHEN** an authorized workflow reruns publication for a version already present on npm
- **THEN** it SHALL verify the existing registry version and repair only missing GitHub artifacts, notes, or formula state without attempting an illegal duplicate npm publication

#### Scenario: Tagged release tooling blocked the original publication
- **WHEN** an authorized manual recovery targets an existing release tag whose bundled validation tooling is incompatible with generated metadata or the active npm CLI
- **THEN** the workflow SHALL validate the tagged metadata with current trusted release-control tooling from `master`, restore the unchanged tagged source before packing, run the complete quality gate, and publish or repair only that tagged revision

# release-management Delta

## MODIFIED Requirements

### Requirement: SemVer release calculation
Release automation SHALL derive SemVer from validated Conventional Commits, describe only the delivered current product contract, and SHALL NOT require historical schema migration guidance in README, changelog, or generated release notes.

#### Scenario: Universal transfer breaking release
- **WHEN** this archived change is committed with a breaking `feat!` while the public latest version is 2.x
- **THEN** Release Please SHALL propose 3.0.0 and summarize the config-only workspace and unversioned runtime contracts without a migration guide

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

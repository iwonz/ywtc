## MODIFIED Requirements

### Requirement: SemVer release calculation
Release automation SHALL derive SemVer from validated Conventional Commits and SHALL publish the pending universal transfer contract as version 2.0.0 because it removes public flags, configuration, and state schema v1.

#### Scenario: Universal transfer breaking release
- **WHEN** the archived change is committed with a breaking `feat!` and the public latest version remains 1.x
- **THEN** Release Please SHALL propose 2.0.0 and include the CLI/configuration/state migration guidance in changelog and release notes

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

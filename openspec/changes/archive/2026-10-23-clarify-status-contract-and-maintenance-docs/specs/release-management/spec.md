# Spec Delta

## REMOVED Requirements

### Requirement: SemVer release calculation
**Reason**: Replaced by a consolidated current contract with redundant or superseded scenarios removed and unique behavior retained.
**Migration**: The active specification reference is now "Conventional Commit release calculation"; this documentation change requires no runtime conversion or operator action.

## ADDED Requirements

### Requirement: Conventional Commit release calculation
Release automation SHALL derive SemVer from validated Conventional Commits, describe only the delivered current product contract, and SHALL NOT require historical schema migration guidance in README, changelog, or generated release notes.

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

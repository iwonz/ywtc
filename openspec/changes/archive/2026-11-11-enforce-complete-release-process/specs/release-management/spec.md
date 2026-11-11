# Spec Delta

## ADDED Requirements

### Requirement: End-to-end release completion
A release SHALL remain incomplete until one exact SemVer identity is verified across reviewed Release Please metadata, the Git tag and GitHub Release, attached archive and checksum, npm publication, and the committed Homebrew formula. Automatic and recovery workflows SHALL finish with the same read-only completion gate.

#### Scenario: Source change reaches master
- **WHEN** a release-producing source commit passes CI and Release Please creates or updates its pull request
- **THEN** the source push and open release pull request SHALL be reported as a pending release rather than a completed release

#### Scenario: Release channels agree
- **WHEN** the release pull request is merged and publication jobs finish for `vX.Y.Z`
- **THEN** a final workflow gate SHALL verify the non-draft GitHub Release and tag identity, the versioned npm archive and checksum assets, installation notes, exact npm package metadata and downloadable tarball, and a `Formula/ywtc.rb` on current `master` that references that tarball and its SHA-256

#### Scenario: Release channel is absent or mismatched
- **WHEN** any required channel is missing, pending, malformed, or identifies a different version or artifact
- **THEN** the final gate SHALL fail with the affected channel and expected version without creating tags, republishing npm, or modifying the formula

#### Scenario: Release recovery is rerun
- **WHEN** an authorized recovery targets an existing release version
- **THEN** the same completion gate SHALL verify repaired channel state idempotently before the release is reported complete

#### Scenario: Maintainer completes a requested release
- **WHEN** a maintainer or repository agent is asked to release a release-producing change
- **THEN** they SHALL review and merge the generated release pull request, monitor the publication workflow through the final completion gate, and report success only after every channel passes

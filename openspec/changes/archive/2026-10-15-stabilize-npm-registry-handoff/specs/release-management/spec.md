# Spec Delta

## ADDED Requirements

### Requirement: Observable npm registry handoff
After npm publication, release automation SHALL wait within a bounded retry window until the exact release version and its downloadable registry tarball are observable before generating or publishing the Homebrew formula.

#### Scenario: Registry propagation is delayed
- **WHEN** npm accepts version `X.Y.Z` but its version metadata or tarball is temporarily unavailable
- **THEN** automation SHALL report retry progress with bounded backoff and continue automatically once the exact version and tarball become available

#### Scenario: Registry propagation completes
- **WHEN** the registry returns metadata for exact version `X.Y.Z` and its tarball downloads successfully within the retry window
- **THEN** automation SHALL derive the formula URL and checksum from that tarball and proceed with the existing Homebrew verification and publication flow

#### Scenario: Registry propagation times out
- **WHEN** the exact version or downloadable tarball remains unavailable for the full retry window
- **THEN** automation SHALL fail with the package version, attempt count, and exact recovery command while leaving the tracked formula unchanged

#### Scenario: Existing version recovery
- **WHEN** an authorized recovery targets a version already observable in the registry
- **THEN** automation SHALL complete the handoff without republishing the npm version and SHALL continue idempotent artifact and formula repair

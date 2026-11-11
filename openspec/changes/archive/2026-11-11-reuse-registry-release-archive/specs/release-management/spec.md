# Spec Delta

## MODIFIED Requirements

### Requirement: Verifiable release artifacts
Each GitHub Release SHALL publish `@iwonz/ywtc` to npm with OIDC provenance and include the byte-identical downloadable npm registry archive plus SHA-256 checksum after validation. An authorized recovery SHALL preserve the tagged source while using current trusted release-control validation compatible with the active npm CLI.

#### Scenario: Release artifact is produced
- **WHEN** a GitHub Release is created from a valid release revision
- **THEN** the workflow SHALL publish the public scoped package without a long-lived npm token, wait for and download the exact registry tarball, attach that tarball and its checksum, and include verified npm, npx, and Homebrew installation commands in release notes

#### Scenario: Existing release is retried
- **WHEN** an authorized workflow reruns publication for a version already present on npm
- **THEN** it SHALL verify the existing registry version, download its exact tarball, repair missing or mismatched GitHub artifacts, notes, or formula state from that immutable registry artifact, and SHALL NOT attempt duplicate npm publication

#### Scenario: Tagged release tooling blocked the original publication
- **WHEN** an authorized manual recovery targets an existing release tag whose bundled validation tooling is incompatible with generated metadata or the active npm CLI
- **THEN** the workflow SHALL validate the tagged metadata with current trusted release-control tooling from `master`, restore the unchanged tagged source before packing, run the complete quality gate, and publish or repair only that tagged revision

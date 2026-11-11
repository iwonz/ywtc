# Spec Delta

## MODIFIED Requirements

### Requirement: Shared audited artifact construction
Package smoke tests and publication SHALL construct artifacts through one checked staging path compatible with supported npm versions, retaining the audited bundled dependency closure and immutable source files.

#### Scenario: npm 12 packs the release
- **WHEN** packaging and consumer installation run with npm 12
- **THEN** valid bundled dependency edges SHALL install successfully and the security-critical replacement SHALL remain active without disabling npm validation or downgrading publication tooling

#### Scenario: Artifact is verified and published
- **WHEN** the workflow prepares a registry archive and checksum
- **THEN** it SHALL use the same staging rules tested by installed-package smoke tests and exclude runtime/configuration/cache data

#### Scenario: Authorized recovery loads shared packing tools
- **WHEN** recovery validates an existing tag using current trusted tools
- **THEN** helpers SHALL come from the same trusted revision, temporary source copies SHALL be restored or removed before packing, and the external packer entry point SHALL execute outside the repository package module boundary while operating on unchanged tagged source

#### Scenario: Recovery packer is materialized temporarily
- **WHEN** the audited packer and its shared helper are copied together into a temporary directory outside the repository package boundary
- **THEN** the packer SHALL execute successfully under a supported Node.js runtime without relying on the repository's nearest `package.json` module type

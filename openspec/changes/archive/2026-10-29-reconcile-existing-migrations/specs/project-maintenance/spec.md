## ADDED Requirements

### Requirement: Synchronization quality gates
Project, browser and installed-package checks SHALL cover reviewed synchronization, source access expansion, stable IDs/paths, independent resource/comment changes, incoming references, protected decisions, stale previews, interruption and reversible leaf-trash boundaries using neutral fixtures. Documentation SHALL retain the existing nine-section README contract.

#### Scenario: Synchronization fixture expands access
- **WHEN** a previously complete migration gains selected pages
- **THEN** tests SHALL prove existing bodies receive no unnecessary PUT, new pages receive full bootstrap before resources, IDs/paths are stable, and related references are repaired without duplicating objects

#### Scenario: Destructive boundary is tested
- **WHEN** trash fixtures include children, drafts, unsupported providers, lost responses or changed identities
- **THEN** tests SHALL prove no purge, child deletion, ownership override or implicit recreation occurs

#### Scenario: Published package is checked
- **WHEN** the installed package runs synchronization and its review UI
- **THEN** shared jobs, offline assets, private plans, linked reports and decision revision checks SHALL work without bundling real runtime data, credentials or internal migration identifiers

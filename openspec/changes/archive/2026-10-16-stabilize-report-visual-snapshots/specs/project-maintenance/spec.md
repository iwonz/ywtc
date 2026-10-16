# Spec Delta

## ADDED Requirements

### Requirement: Deterministic offline report typography
The packaged report application SHALL render its interface with self-hosted font resources embedded in the autonomous HTML shell and SHALL NOT depend on fonts installed by the host operating system.

#### Scenario: Report opens offline
- **WHEN** a generated report is opened through `file://` on a supported platform
- **THEN** its Latin and Cyrillic interface text SHALL use the packaged typeface without a network request or system-font dependency

#### Scenario: Visual checks run on supported CI platforms
- **WHEN** desktop/mobile and light/dark report snapshots run in Linux CI or the maintained local development environment
- **THEN** the same strict visual baselines SHALL pass without platform-specific height drift or broadly relaxed comparison thresholds

#### Scenario: Package is installed in isolation
- **WHEN** the npm tarball generates a report outside the source checkout
- **THEN** the resulting single HTML file SHALL contain the font resources required to render the dashboard autonomously

## MODIFIED Requirements

### Requirement: Deterministic offline report typography
The packaged report application SHALL render its interface with self-hosted font resources embedded in the autonomous HTML shell and SHALL NOT depend on fonts installed by the host operating system.

#### Scenario: Report opens offline
- **WHEN** a generated report is opened through `file://` on a supported platform
- **THEN** its Latin and Cyrillic interface text SHALL use the packaged typeface without a network request or system-font dependency

#### Scenario: Visual checks run on supported CI platforms
- **WHEN** desktop/mobile and light/dark report snapshots run in Linux CI or the maintained local development environment
- **THEN** reviewed platform-keyed baselines SHALL preserve matching geometry and strict comparison thresholds while accounting for native font rasterization differences

#### Scenario: Package is installed in isolation
- **WHEN** the npm tarball generates a report outside the source checkout
- **THEN** the resulting single HTML file SHALL contain the font resources required to render the dashboard autonomously

## ADDED Requirements

### Requirement: Stable and isolated browser validation
Publication gates SHALL validate supported stable Node.js majors and independent authenticated browser fixtures. Prerelease runtime selection SHALL NOT silently replace a stable-runtime gate; retrying or isolating a scenario SHALL NOT require a previous scenario's session.

#### Scenario: Latest runtime distribution is experimental
- **WHEN** an upstream floating alias selects an alpha or other prerelease runtime
- **THEN** publication gates SHALL continue using explicit supported stable majors without disabling browser, package or security checks

#### Scenario: A browser worker starts after a failure
- **WHEN** a scenario starts in a fresh or restarted worker
- **THEN** it SHALL establish its own valid fixture session and remain runnable without earlier scenarios

#### Scenario: Cross-platform visual typography
- **WHEN** Linux and macOS render report identifiers and metadata
- **THEN** packaged typography SHALL preserve consistent geometry without relying on an operating-system monospace font or relaxing visual thresholds

#### Scenario: Standalone UI is built in a short checkout path
- **WHEN** checkout path redaction encounters an unrelated route or worker name sharing the directory prefix
- **THEN** the packaged interface SHALL preserve that identifier and retain working SSR, authentication and local asset access

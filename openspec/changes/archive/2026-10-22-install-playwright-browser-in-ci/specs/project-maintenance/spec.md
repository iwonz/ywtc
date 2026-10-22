# Spec Delta

## ADDED Requirements

### Requirement: Hermetic browser quality gates
Automated quality and publication jobs that execute browser tests SHALL provision the browser version required by the locked project dependencies before running the complete project check.

#### Scenario: Matrix quality job runs
- **WHEN** a GitHub Actions quality job installs project dependencies
- **THEN** it SHALL install the required Chromium browser and operating-system dependencies before `npm run check`

#### Scenario: Release candidate is validated
- **WHEN** a release publication job validates a tagged revision with the complete project check
- **THEN** it SHALL install the required Chromium browser and operating-system dependencies after `npm ci` and before `npm run check`

#### Scenario: Browser provisioning fails
- **WHEN** the required browser or its operating-system dependencies cannot be installed
- **THEN** the affected quality or publication job SHALL fail before reporting a successful quality gate or publishing an artifact

#### Scenario: Workflow contract is checked
- **WHEN** project tests inspect the release workflow
- **THEN** they SHALL verify browser provisioning is present in every browser-bearing job and ordered between dependency installation and the complete project check

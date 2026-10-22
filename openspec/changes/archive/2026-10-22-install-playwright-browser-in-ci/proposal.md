# Proposal

## Why

The complete project check includes Playwright browser tests, but GitHub-hosted runners do not guarantee that the matching Chromium binary is preinstalled. Current quality and publication jobs can therefore fail before exercising the application even when the revision passes locally.

## What Changes

- Provision the Playwright-managed Chromium browser and its operating-system dependencies after dependency installation and before the complete project check.
- Apply the same browser provisioning contract to matrix quality jobs and release artifact validation.
- Add workflow contract coverage so browser provisioning cannot be removed or reordered unnoticed.
- Keep local development commands and the published CLI unchanged.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `project-maintenance`: Require hermetic browser provisioning before browser-bearing CI and release quality gates.

## Impact

- Affects `.github/workflows/release.yml`, release workflow tests, and the project-maintenance specification.
- Uses the Playwright CLI already installed from the locked development dependencies; no product dependency or public interface changes.
- Does not change migration behavior, runtime data, credentials, release permissions, or publication semantics.

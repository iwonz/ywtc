# Proposal

## Why

npm 12 refuses bundles whose dependency declarations rely on root-only overrides. The audited renderer must reach installed consumers with valid dependency edges, preserving the security replacement already verified by project tests.

## What Changes

- Add one shared release packer that creates a private staging tree from intended files and the lockfile's audited bundled closure.
- Record actual resolved dependency versions/aliases in bundled manifests and omit root-only override policy from the publication manifest.
- Use the exact same artifact construction in package smoke tests and OIDC publication; verify isolated npm 11/12 consumer behavior.
- Preserve source manifests, dependency code, licenses, CLI/UI/migration semantics, secrets and provider data. No real migration, deletion or tag rewriting.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `project-maintenance`: valid audited bundled dependency handoff.
- `release-management`: canonical shared artifact construction and verification.

## Impact

Packaging scripts, publication workflow, package script, canonical development guidance and fixtures. Follow-up patch supersedes the tagged but unpublished npm 5.4.1 artifact.

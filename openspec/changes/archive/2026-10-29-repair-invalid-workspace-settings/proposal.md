# Proposal

## Why

The settings API rejects every schema-invalid workspace, including an untouched init template with an empty organization ID. This locks the browser out of the very forms needed to fix it and discards usable profiles and hidden credentials during repair.

## What Changes

- Return a safe editable projection and field diagnostics for incomplete or invalid settings, without exposing credentials or malformed YAML.
- Let the operator stage fixes across profiles, limits and supported mapping policies before applying one fully validated configuration.
- Require explicit repair confirmation, preserve the exact original YAML in a private backup, and enforce revisions/atomic replacement.
- Keep ordinary valid-profile editing and strict CLI/job validation; no automatic provider calls, migration/state changes or live-config writes while drafting.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `workspace-management`: recover invalid browser configuration without CLI handoff.
- `local-control-center`: actionable settings diagnostics and explicit validated repair.

## Impact

Settings API/model, connection forms and workflow readiness, API/browser fixtures and existing configuration guidance. Runtime migration mappings and public CLI/configuration schema stay unchanged.

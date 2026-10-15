# Proposal

## Why

The workspace currently splits connection data between a marker, YAML, `.env`, process overrides, and versioned runtime schemas. A single strict current configuration makes setup deterministic, keeps the public contract concise, and removes compatibility behavior that the project does not intend to support.

## What Changes

- **BREAKING** Store connection secrets and all ywtc runtime settings directly in ignored `ywtc.config.yaml`; remove `.env`, environment overrides, and secret-variable indirection.
- **BREAKING** Select operational workdirs by explicit `--workdir`, a `ywtc.config.yaml` in the exact current directory, then `~/.ywtc`; make `init` use only explicit `--workdir` or `~/.ywtc`.
- **BREAKING** Remove `.ywtc-workspace.json` and all schema-version fields or version-specific compatibility branches from configuration, state, reports, and export manifests.
- Validate one strict current format, preserve invalid runtime files without conversion or deletion, and keep secret redaction plus non-destructive state/export safeguards.
- Document only the current contract and release it through the existing SemVer pipeline as the next major version, without a migration guide.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `workspace-management`: Replace marker and `.env` workspaces with config-only selection, initialization, validation, and diagnostics.
- `wiki-migration`: Define unversioned strict state/report behavior and config-based network limits without compatibility branches.
- `static-export`: Define an unversioned strict ownership manifest.
- `project-maintenance`: Align documentation, package contents, credential hygiene, and validation with config-only workspaces.
- `release-management`: Make release calculation version-agnostic and require the breaking change to produce the next major release without migration guidance.

## Impact

The workspace/configuration modules, CLI command setup, state/report/export serialization, tests, templates, release hygiene, package dependencies, README, agent instructions, and five existing OpenSpec capabilities change. Existing remote content and runtime files are never deleted; files that do not match the sole current format are not adopted or converted.

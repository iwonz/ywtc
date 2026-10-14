## Why

Before the first public repository commit, `ywtc` should describe and implement only its current `.states/` runtime model. Compatibility branches for the never-published `.wiki-migration/` layouts increase state-selection complexity, test surface, documentation noise, and release-hygiene exceptions without providing a supported public contract.

## What Changes

- **BREAKING**: stop discovering or adopting `.wiki-migration/states/<id>.json` and `.wiki-migration/state.json`; only the current `.states/<id>.json` automatic location is supported.
- Remove legacy fallback descriptors, load states, progress/report fields, migrator options, tests, documentation, and release-tool exceptions that exist solely for old runtime layouts.
- Keep explicit `--state <path>` as the current supported override; it is not an automatic backward-compatibility mechanism.
- Move the local pre-repository `.wiki-migration/` runtime directory into an ignored manual backup below `.states/` instead of deleting it, then remove `.wiki-migration/` from tracked ignore/tooling rules.
- Tighten current OpenSpec wording and replace the scaffolded project-maintenance purpose with an accurate `ywtc` purpose.
- Prepare a clean current-only tree for Git initialization and first publication; repository creation, commit, and push occur after the OpenSpec change is completed and archived.
- Do not delete Confluence content, local credentials, current `.states/` data, or the recoverable local backup.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `wiki-migration`: remove automatic legacy runtime discovery and make `.states/` the sole default runtime contract.
- `project-maintenance`: document and enforce current-only repository hygiene for the initial public release.

## Impact

This simplifies state resolution, migration orchestration, progress/report metadata, tests, README, `.gitignore`, Biome, release checks, agent guidance, and current specifications. Users of unpublished legacy layouts must deliberately supply a compatible state through the existing `--state` override or start with current automatic state.

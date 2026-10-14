## Why

The product is named `ywtc`, but its default runtime directory still uses the older `.wiki-migration` label and the CLI heading does not lead with the product name. Runtime paths and operator-facing naming should consistently reflect `ywtc` without losing resumability for installations that already have state under the old directory.

## What Changes

- Change the automatic runtime root from `.wiki-migration/` to `.states/`.
- Store automatic state directly as `.states/<state-id>.json`, with caches and reports at `.states/cache/` and `.states/reports/`.
- When the new automatic state is absent, read compatible state from `.wiki-migration/states/<state-id>.json` and then `.wiki-migration/state.json`; future live writes go only to `.states/` and old files remain untouched.
- Keep both old and new runtime directories ignored and protected by release hygiene so existing migration data cannot be published accidentally.
- Make `ywtc` the explicit product name in CLI/operator-facing wording and replace current test/runtime labels that still imply the old project name.
- Update README, agent guidance, tests, and current specifications to use `.states/`, while retaining narrowly scoped legacy-path documentation where it explains compatibility.
- Do not rename or delete the user's local checkout directory, archived historical OpenSpec records, or existing runtime data.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `wiki-migration`: change default automatic state/report/cache locations while preserving read-only adoption of old state locations.
- `project-maintenance`: align public naming and repository hygiene with `ywtc` and the `.states/` runtime root.

## Impact

This affects state path resolution and fallbacks, report/cache placement, CLI help, ignore/release-hygiene configuration, README and AGENTS guidance, OpenSpec contracts, and associated unit/integration tests. Explicit `--state` paths and the state file schema remain unchanged.

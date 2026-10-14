## Why

The single default `.wiki-migration/state.json` makes unrelated migrations collide and requires operators to invent state filenames manually. Equivalent source and target references also need to converge on one resumable migration automatically, while operators need an explicit, recoverable way to disregard prior mappings.

## What Changes

- Resolve a canonical migration identity from the authenticated Yandex organization and resolved source page plus the normalized Confluence instance, space, and resolved target page.
- Store automatically selected state files under `.wiki-migration/states/<stable-id>.json`, independent of whether inputs were supplied as slugs, IDs, or supported URL forms.
- Adopt a matching legacy `.wiki-migration/state.json` when no automatic state exists, while leaving unrelated legacy state untouched.
- Keep `--state` as an exact manual override and add `--fresh` to start with empty mappings; live fresh runs preserve an existing selected state as a timestamped backup.
- Surface the selected state, reuse or fresh behavior, backup location, and actionable validation/read/write errors in the CLI and migration report.
- Document automatic state selection, multiple migrations, explicit overrides, fresh-run duplication risk, and recovery guidance.
- Add unit and integration coverage for canonical identity, automatic separation and reuse, legacy adoption, fresh runs, dry-run immutability, and invalid state/CLI inputs.
- Do not delete destination content, silently adopt unrelated mappings, expose credentials, or mutate state during dry-run.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `wiki-migration`: make resumable state selection automatic and canonical, add recoverable fresh-run semantics, and require actionable state diagnostics.
- `project-maintenance`: document the new CLI/state behavior in the complete parameter and operator guidance.

## Impact

This affects CLI option parsing and output, migration orchestration, state persistence, runtime cache/report placement, report metadata, README guidance, and Vitest coverage. It uses only Node.js 22 built-in crypto and filesystem APIs and adds no runtime dependency.

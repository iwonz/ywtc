## Context

`ywtc` has not yet been initialized as a Git repository or published. Its current implementation is `.states/`-based, but the preceding internal development iterations left automatic adoption for two `.wiki-migration/` layouts plus types, report fields, progress branches, tests, ignore rules, and documentation for them. Carrying unpublished compatibility into the first commit would make obsolete behavior part of the public surface.

One local `.wiki-migration/state.json` exists. It contains runtime mappings and must not be committed, but permanent deletion is unnecessary for code cleanup.

## Goals / Non-Goals

**Goals:**

- Make `.states/<state-id>.json` the only automatic state location and `.states/` the only automatic runtime root.
- Remove all code branches and public fields whose only purpose is automatic legacy adoption.
- Make current documentation/specifications describe only supported behavior.
- Keep the local old state recoverable outside all runtime lookup paths.
- Produce a source tree suitable for a secret-free first repository commit.

**Non-Goals:**

- Convert or merge unpublished state automatically.
- Delete the local old state, current `.states/` data, `.env`, or any Confluence content.
- Remove explicit `--state`, current state schema version 1, OpenSpec archive history, or functional “wiki migration” terminology.
- Change retry, conversion, title conflict, reporting, or migration semantics unrelated to compatibility removal.

## Decisions

### Automatic lookup has exactly one path

`resolveStateLocation()` returns the selected current file and runtime directories only. `StateStore.load()` reads that file or initializes empty state; it no longer accepts fallback paths or mismatch policies. The migrator no longer exposes a legacy runtime override.

Keeping dormant generic fallback APIs was rejected because they preserve unused complexity and could reintroduce implicit adoption later. Explicit `--state` already covers deliberate non-default file selection.

### Legacy-only observability fields are removed

The `legacy` load source, fallback filenames, ignored-fallback state, `loadedFrom` report field, and corresponding terminal branches are removed. `existing`, `new`, and `fresh` are sufficient for current behavior. Fresh backup reporting remains because it is active functionality.

### Local old data is moved, not deleted

The local `.wiki-migration/` directory is moved to `.states/pre-housekeeping-backup-2026-10-14/`. Since the automatic loader only examines JSON files directly at `.states/<id>.json`, the nested backup cannot be adopted accidentally. `.states/` is ignored and release-protected. No tracked source refers to the backup.

### Repository hygiene is current-only

`.gitignore`, Biome, release checks, AGENTS, README, and current OpenSpec requirements remove `.wiki-migration/` special cases. Historical archived OpenSpec changes remain immutable process records and are not runtime or supported-product documentation.

### Git publication follows completed project validation

After implementation, `npm run check`, OpenSpec archival, and strict validation complete, initialize `master`, configure a verified local author identity, stage with ignore rules active, inspect the staged file list and diff for credentials/runtime data, create one meaningful root commit, add the canonical GitHub origin, and push without force.

## Risks / Trade-offs

- **[An internal user relied on automatic legacy adoption]** → This is intentionally breaking before first publication; explicit `--state` remains available when deliberate recovery is needed.
- **[Local old state is mistaken for active state]** → Move it under a clearly named nested backup that the resolver cannot select.
- **[Sensitive runtime data enters the first commit]** → Keep `.env` and `.states/` ignored, run release hygiene, inspect `git status`, `git diff --cached`, and tracked filenames before commit and push.
- **[Remote repository is not empty or push is rejected]** → Inspect remote refs first and never force-push; stop and report if remote history would be overwritten.

## Migration Plan

1. Remove legacy APIs, branches, tests, docs, and tool exceptions.
2. Move the local old runtime directory into the ignored manual backup.
3. Run the full quality and OpenSpec lifecycle.
4. Initialize and audit Git, create the root commit on `master`, and push normally to the empty canonical remote.
5. Rollback code through Git after publication; restore the local backup manually only if the operator deliberately supplies it through `--state`.

## Open Questions

None.

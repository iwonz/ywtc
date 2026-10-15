# Proposal

## Why

Remote pages are currently created with a temporary transfer message, and any later attachment failure can prevent the real body update, leaving visible placeholder-only pages. Operators also need a direct, cross-platform way to locate and open the detailed report produced by every run.

## What Changes

- Create every remote page with a complete source-derived bootstrap body instead of a progress placeholder, then refine links and resources after destination mappings exist.
- Isolate resource failures so page content is still written and verified with explicit source fallbacks, partial state, and resumable retries.
- Detect and repair unchanged ywtc-generated placeholder bodies on existing mapped pages without weakening manual-edit conflict protection.
- Verify actual destination content semantically before marking a page complete or partial, and report actual destination previews plus resource fallbacks.
- Add `--open-report`, `ywtc reports list`, and `ywtc reports open [run-id]`, with safe workdir resolution and clickable file URLs.
- Simplify the interactive wizard's first dry-run example to required flags plus `--dry-run`, adding `--workdir` only when the selected workspace requires it.
- Keep remote content non-destructive: no destination page or attachment is deleted automatically.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `wiki-migration`: Guarantee source-derived content during creation and partial resource failures, repair generated placeholders, verify actual bodies, and expose report discovery/opening commands.
- `workspace-management`: Generate the shortest reliable wizard dry-run command for default and custom workdirs.
- `project-maintenance`: Document and package the report commands and content-preservation behavior within the fixed README structure.

## Impact

- Affects the migration pipeline, normalized render context, destination adapters, reports service, CLI arguments/output, interactive initialization, README, tests, and OpenSpec contracts.
- Adds one cross-platform runtime dependency for opening local report URLs.
- Keeps the current state structure and canonical state identity so affected runs resume against their existing page mappings.

## Why

Operators sometimes need to migrate or re-run one Yandex Wiki page without importing its entire descendant tree. The current CLI always discovers every accessible descendant, which makes targeted migrations slower and broader than intended.

## What Changes

- Add a `--single-page` boolean CLI flag that limits the selected migration scope to the exact `--source` page.
- Skip the Yandex descendants request when single-page mode is active while preserving the selected page's content, attachments, images, grids, links, dry-run behavior, reporting, and resumability.
- Treat links to unselected descendants like other links outside the migration scope and leave them pointing to Yandex Wiki.
- Show the selected scope in terminal output and document the flag in CLI help and README.
- Do not delete, mark, or otherwise mutate previously migrated descendant pages when running in single-page mode.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `wiki-migration`: Add an operator-selected single-page scope alongside the default subtree migration behavior.

## Impact

- CLI parsing and help in `src/cli.ts`.
- Discovery and stale-mapping behavior in `src/migrator.ts`.
- Terminal scope display in `src/progress.ts`.
- Integration/progress tests and public CLI documentation.
- No dependency, authentication, API contract, state-format, or destructive-operation changes.

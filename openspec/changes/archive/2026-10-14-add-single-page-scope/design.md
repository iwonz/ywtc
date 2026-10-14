## Context

Migration discovery always resolves the source root and then calls the Yandex descendants endpoint, loads every returned page, and builds a complete tree. This is correct for the default use case but prevents a targeted migration of one page. The existing state identity is based on source root, destination parent, and space, so the root mapping can be safely reused across subtree and single-page runs.

## Goals / Non-Goals

**Goals:**

- Provide an explicit `--single-page` boolean flag with subtree migration remaining the default.
- Avoid the descendants API call entirely when the flag is active.
- Migrate all supported content and resources belonging to the selected page.
- Keep links to pages outside the selected scope pointed at Yandex Wiki.
- Preserve state compatibility and avoid reporting or touching unselected descendants as stale.
- Make the active scope visible in CLI help, terminal startup output, reports through their one-page plan, and README.

**Non-Goals:**

- Selecting multiple unrelated pages in one run.
- Migrating child pages selectively by depth or pattern.
- Deleting, moving, marking, or updating destination descendants that are outside the active scope.
- Changing retry, conflict, content-degradation, authentication, or state-file formats.

## Decisions

- Add `singlePage: boolean` to `MigrationOptions` and parse `--single-page` with Node.js `parseArgs` as a boolean defaulting to `false`. This preserves current behavior unless the operator opts in.
- In single-page mode, use an empty descendant identity list and build the migration tree from the resolved root alone. This prevents both pagination and page-detail requests for descendants.
- Reuse the existing state identity and root mapping. A single-page rerun therefore updates the same destination root rather than creating a duplicate.
- Suppress stale destination calculation in single-page mode. Existing descendant mappings are intentionally out of scope, not evidence that their source pages disappeared.
- Build internal page references only from selected pages, as today. A root-page link to an excluded descendant consequently remains a Yandex Wiki URL.
- Add a `singlePage` field to terminal progress startup input and render the scope explicitly; the existing summary will naturally report one page and zero descendants.

## Risks / Trade-offs

- [An operator can mistake a single-page run for a subtree run] → Print the selected scope at startup and document the flag in help and README.
- [Previously migrated descendants remain in Confluence] → This is deliberate non-destructive behavior; they are neither updated nor marked stale in this mode.
- [Links to excluded descendants are not rewritten to previously mapped Confluence pages] → Scope semantics take precedence; only selected pages participate in link rewriting, so excluded links remain valid Yandex Wiki links.
- [A shared state contains more pages than the current scope] → Retain the state unchanged and operate only on the selected root mapping.

## Migration Plan

1. Add and wire the CLI flag and terminal scope output.
2. Gate descendant discovery and stale reporting in the migrator.
3. Add integration and progress coverage for both modes.
4. Update README and help, run all checks, then archive the OpenSpec change.

Rollback consists of removing the flag and its discovery branch; state files remain compatible because their schema is unchanged.

## Open Questions

None.

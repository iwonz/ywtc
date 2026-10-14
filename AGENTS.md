# Project agent instructions

Every project modification MUST follow the complete OpenSpec workflow. This includes code, bug fixes, refactors, tests, dependencies, tooling, documentation, and repository configuration; there are no informal-change exceptions.

## Required workflow

1. Inspect `openspec/specs/`, active changes, and the affected code before editing.
2. Create one descriptive kebab-case change with `npx openspec new change <name>`.
3. Use `npx openspec status --change <name> --json` and `npx openspec instructions <artifact> --change <name> --json` to create every artifact required by the active schema. For the default schema this means proposal, delta specs, design, and tasks.
4. Run `npx openspec validate <name> --strict --no-interactive` before implementation. Do not change implementation files until the change is valid.
5. Read every path returned by `npx openspec instructions apply --change <name> --json`, implement each task, and mark its checkbox complete immediately after verification.
6. Run `npm run check`. Fix failures rather than weakening checks or adding broad ignores.
7. Archive with `npx openspec archive <name> --yes`; this synchronizes delta specs into the main specifications.
8. Run `npm run spec:validate` after archival and confirm there is no unfinished active change.

If implementation reveals a contract or design change, update the OpenSpec artifacts and validate them again before continuing.

## Commit and release discipline

- Use Conventional Commit messages. `fix`, `perf`, and `revert` produce SemVer patches; `feat` produces a minor; `!` or a `BREAKING CHANGE` footer produces a major. Documentation, tests, build, CI, and chores do not release by themselves.
- Complete and archive every underlying OpenSpec change before committing it. Do not mix substantive code, documentation, tooling, or specification changes into a generated Release Please pull request.
- A Release Please pull request is publication metadata for already-audited changes. It may update only `CHANGELOG.md`, `package.json`, `package-lock.json`, and `.release-please-manifest.json`; review the calculated version before merging.
- Do not create or move release tags manually during normal development. The validated manual-tag workflow exists only for the initial `v1.0.0` bootstrap and explicit release recovery.
- GitHub is the release channel. Do not add npm publication or long-lived release credentials without a new validated OpenSpec change.

## Safety and repository hygiene

- Never add tokens, authorization headers, populated secrets, internal organization names, migration-specific domains, user-home paths, downloaded attachments, state, cache, or generated reports to tracked files.
- Keep runtime data under `.states/` and local credentials only in ignored `.env` files. Examples MUST use empty secrets and `example.com` domains.
- Do not delete Confluence content. Preserve resumability and dry-run's no-mutation guarantee.
- Do not weaken TLS verification or secret redaction.
- Use `apply_patch` for source edits and preserve unrelated user changes.

## Definition of done

A change is done only when its OpenSpec tasks are complete, `npm run check` passes, delta specs are synchronized, the change is archived, and strict validation passes against all OpenSpec content.

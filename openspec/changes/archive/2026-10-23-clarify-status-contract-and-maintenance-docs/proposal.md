# Proposal

## Why

The outcome reference does not explain all current assignment conditions and sometimes implies that nothing was written when an earlier or bootstrap result can exist. Accumulated specifications also contain superseded scenarios, duplicate rules, and operational advice that disagrees with current configuration, retry, and export behavior.

## What Changes

- Document every reported object/run status with applicability, numbered deterministic conditions, and the next operator action; identify intermediate and reserved values explicitly.
- Correct current README defaults, locator formats, workspace initialization, attachment-limit behavior, retry exceptions, and empty-directory export rules while retaining its nine-section structure.
- Consolidate overlapping current specification scenarios and remove completed release-specific requirements from active contracts; preserve archived changes and changelog history.
- Clarify agent workflow, documentation ownership, status-update discipline, and full commit-message validation.
- Extend the existing README contract check to require numbered condition cells and verify documented status coverage against the runtime unions in tests.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `project-maintenance`: exhaustive status reference, current documentation ownership, concise agent instructions, and verified commit messages.
- `wiki-migration`: reconcile current lifecycle, content-impact, diagnostic, and resource-limit contracts and remove redundant scenarios.
- `workspace-management`: distinguish configuration/runtime workdir boundaries from explicit exports and structural validation from selected credential validation.
- `resumable-source-inventory`: retain one unambiguous structural barrier and independent enrichment recovery contract.
- `targeted-run-retry`: align complete-page mention retry and non-blocking enrichment exceptions with the current retry contract.
- `release-management`: express SemVer generically rather than requiring a completed historical release.

## Impact

Affected files are README, AGENTS, OpenSpec context/current specifications, and the existing README validation script/tests. No migration behavior, CLI flags, public state/report structures, dependencies, credentials, runtime files, destination data, archived changes, or release versions are changed. Documentation-only commits do not independently create a product release.

# Design

## Context

See `proposal.md` for motivation. The README already has a strict nine-section order and machine-checked quick-start, common-example, personal-space, and status-table contracts. Its 8,305 words nevertheless bury scenario choice under reference prose. The status tables are intentionally large: they are the canonical exhaustive reference and cannot be replaced by a summary.

## Goals / Non-Goals

**Goals:**

- Make the first screen useful to an operator who does not yet know which command or mode applies.
- Preserve the exact nine-section order while arranging material inside it from common workflows to specialist reference.
- Remove duplication and UI narration before shortening normative safety or outcome semantics.
- Add a regression check that keeps the maintained README at or below 6,500 whitespace-delimited words.

**Non-Goals:**

- Changing CLI behavior, configuration, defaults, statuses, migration identity, or output formats.
- Replacing the exhaustive status tables with conceptual summaries.
- Moving current operator guidance into archived changes, the changelog, or external documentation.

## Decisions

### Put scenario selection immediately after the guided first run

The `Быстрый старт` section will keep the three required commands, then provide a compact table that maps common intent to the minimum entry point: ordinary transfer, personal space in both directions, static export, and resume/retry/sync. This lets a newcomer stop after finding the relevant path while the remaining sections provide increasing depth.

Alternative considered: introduce new top-level sections for scenarios. That would break the established nine-section contract and make navigation less stable.

### Preserve reference completeness while removing narrative duplication

Configuration fields, CLI commands and options remain tables. Repeated prose will become one shared rule or a decision table. Mention and hashtag decision workflows will share a compact structure while retaining their distinct files, commands, and outcomes. Descriptions of local-center illustrations, icons, and visual layout will be removed; operational availability, safety, and report behavior will remain.

Retry, resume, rewrite, fresh-state, and sync behavior will be expressed as an action-selection table. Migration identity and ambiguous scope changes will remain explicit. The reporting section will continue to distinguish object outcomes, transformation-quality notices, retryability, overall run status, and process exit code; every status will retain applicable objects, exhaustive numbered assignment conditions, and an operator action.

Alternative considered: move detailed reference material to another file. The repository contract assigns current operator guidance to `README.md`, and splitting it would make installation-package guidance harder to discover.

### Enforce compactness in the existing README validator

`validateReadmeContract` will count non-empty whitespace-delimited tokens and reject more than 6,500. It will also require the scenario-selector heading and its five scenario labels. Tests will cover both the accepted maintained README and isolated failures for excessive size or a missing scenario.

A word limit is chosen over a line limit because Markdown table formatting and wrapping can change line count without changing reading load. The threshold leaves room for the exhaustive status reference and modest future additions while requiring maintainers to consolidate obsolete or duplicate prose.

Alternative considered: store only the current word count as a snapshot. That would make every useful wording change noisy and would not provide deliberate headroom.

## Risks / Trade-offs

- **[Risk] Compact wording can erase a safety qualification.** → Verify each command, field, default, status condition, and safety claim against source and current specs; keep exhaustive tables intact and run the full check suite.
- **[Risk] The word budget can encourage opaque prose.** → Prefer tables, short sentences, and canonical cross-references; the budget supplements rather than replaces review and structural contract tests.
- **[Risk] Future features may legitimately need more documentation.** → Maintainers can deliberately revise the specified threshold in a new OpenSpec change after consolidating existing material.
- **[Risk] Reordering can break anchors.** → Keep the nine H2 headings and required personal-space/status headings unchanged; only consolidate lower-level headings whose names are not public contracts.

## Migration Plan

1. Add failing contract tests for the size limit and scenario selector.
2. Implement the validator checks.
3. Restructure and shorten README content while preserving machine-checked and normative reference material.
4. Run the README contract tests and full repository checks, then archive the OpenSpec change.

Rollback is a normal revert of the documentation, validator, tests, and synchronized spec commit; no runtime data or external system is migrated.

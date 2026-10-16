# Proposal

## Why

The README is accurate but reads like an accumulated reference: installation is separated from the minimum flow, credentials from configuration, examples from CLI usage, and page/file statuses repeat the same semantics. A shorter task-oriented information architecture will let a new operator reach a safe dry-run quickly while preserving the complete technical contract in one canonical place per topic.

## What Changes

- Replace the fixed thirteen-section structure with nine task-oriented sections: `Быстрый старт`, `Возможности`, `Совместимость`, `Конфигурация`, `CLI`, `Файловый экспорт`, `State и повторные запуски`, `Отчёты и статусы`, and `Разработка`.
- Move the product summary, runtime requirement, and license directly under the project title; combine installation with the three-command guided start.
- Keep credentials under configuration, frequent examples under CLI, limitations under capabilities, and outcome semantics under reports so each rule has one canonical home.
- Merge duplicate page/file outcome tables into one applicability-aware status table without losing the distinction between attempted, blocked, planned, and ambiguous operations.
- Preserve complete provider compatibility, configuration fields, CLI options, content-fidelity rules, safety guarantees, state behavior, and report usage while tightening prose and terminology.
- Update README release checks so they validate the new information architecture and essential operator paths instead of enforcing historical section boundaries or checklist syntax.
- Do not change CLI behavior, migration semantics, runtime schemas, report data, images, package dependencies, or release channels.
- Do not delete or mutate source, destination, workspace, state, or report data.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `project-maintenance`: replace the historical fixed README layout with a concise task-oriented contract and align documentation-specific scenarios with the new canonical sections.

## Impact

- Documentation: `README.md` is reorganized and reduced while remaining a complete operator reference.
- Repository validation: `scripts/release-check.mjs` and its tests validate the new headings and critical quick-start/reference content.
- Specifications: documentation requirements in `project-maintenance` are updated; runtime and public API behavior are unchanged.

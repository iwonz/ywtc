# Proposal

## Why

Mapped destination pages and comment archives can be reported as conflicts after Confluence normalizes their bodies or advances their versions, which prevents the source-authoritative rerun from updating the page and unnecessarily blocks its descendants. The report also repeats run-level information across several panels and uses verbose selectors for two compact display preferences.

## What Changes

- **BREAKING** Treat every destination page and comment archive already proven by state mapping as managed by ywtc: the current source representation replaces differing destination content through a new provider version instead of producing a user-edit conflict.
- Compare destination content semantically before writing, skip equivalent updates, retry bounded Confluence version races against the latest version, and checkpoint fingerprints and versions only after confirmed read-back.
- Reserve `conflict` for ambiguous ownership or identity; automatically replan earlier conflict/blocked outcomes and block descendants only when their destination parent is genuinely unavailable.
- Apply the same authoritative policy to mapped Confluence comment archives while retaining revision-only behavior for Yandex Wiki comments and preserving all historical objects.
- Merge the report header, progress, comparative summary, quality indicators, run metadata, output links, and JSON download into one compact overview.
- Remove standalone root-cause and outputs panels plus the local-report disclaimer; keep detailed causal diagnostics in the hierarchy and per-page problem dialog.
- Replace language and theme selects with accessible icon-only cycling controls that retain offline operation and remembered preferences.
- Update current State and Reports documentation without adding a migration guide or changing the fixed README section structure.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `wiki-migration`: change mapped destination update, retry, state checkpoint, dependency-blocking, conflict, and report-dashboard behavior.
- `comment-archives`: change mapped archive update and revision semantics while preserving non-deletion and verification.
- `project-maintenance`: update current README and browser/package quality requirements for the compact accessible report.

## Impact

- Migration orchestration, provider adapters, destination verification, state data, comment archive handling, issue classification, and retry behavior.
- The bundled React/shadcn report UI, translations, accessibility/browser tests, report fixtures, and package smoke tests.
- Current OpenSpec requirements and the existing README `State` and `Отчёты` sections.
- No destination pages, versions, attachments, or comments are deleted. Unmapped and ambiguously owned destination objects remain protected.

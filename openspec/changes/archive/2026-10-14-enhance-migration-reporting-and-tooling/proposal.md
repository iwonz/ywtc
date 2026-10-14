## Why

Operators need a durable, visual migration record that makes hierarchy, fidelity, omissions, and failures inspectable without reading terminal logs. The repository also needs a repeatable OpenSpec-first maintenance workflow and public-project tooling before it is published at `github.com/iwonz/ywtc`.

## What Changes

- Replace the flat Markdown report with one self-contained report directory per run containing a minimal interactive HTML report and downloadable JSON metadata.
- Show migration totals, hierarchy, page/resource metrics, warnings, errors, stale items, and a per-page side-by-side source/destination preview.
- Keep all generated report directories and their potentially sensitive runtime content outside Git through the existing ignored runtime root.
- Add repository-level agent instructions that require the complete OpenSpec proposal/spec/design/tasks/apply/validate/sync/archive lifecycle for every change.
- Replace ESLint with Biome, add Knip dead-code/dependency checks, and provide one aggregate verification command.
- Publish concise setup, migration, report, and development documentation; declare the public repository metadata and retain the MIT license.
- Add an original, text-free README header illustration generated specifically for this project.
- Non-goals: reports do not upload themselves, do not embed credentials, do not delete destination content, and do not attempt pixel-perfect browser capture of authenticated Wiki or Confluence pages.

## Capabilities

### New Capabilities

- `project-maintenance`: Public repository metadata, OpenSpec-first agent workflow, Biome/Knip quality gates, concise contributor documentation, and README presentation assets.

### Modified Capabilities

- `wiki-migration`: Replace JSON/Markdown output with a per-run HTML/JSON report bundle containing hierarchy, metrics, failure details, and page comparisons while remaining local and ignored.

## Impact

- Reporting contracts and runtime output in `src/report.ts`, `src/migrator.ts`, terminal progress, and tests.
- Confluence page retrieval expands rendered view content for comparison where available; dry-runs use local render previews.
- Development dependencies, scripts, configuration, repository instructions, package metadata, README, and documentation assets change.
- Runtime report contents can include migrated page text, so `.wiki-migration/` remains strictly ignored and excluded from package publication.

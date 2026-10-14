## 1. Report model and rendering

- [x] 1.1 Replace flat Markdown output with per-run `index.html` and `report.json` bundles and update public report path types.
- [x] 1.2 Add report hierarchy, status, byte/count/link/image/table/code metrics, warnings, errors, stale mappings, and compact downloadable metadata.
- [x] 1.3 Add safe source YFM and Confluence Storage Format preview renderers with sandboxed side-by-side HTML comparisons.
- [x] 1.4 Expand Confluence reads with rendered view content and connect live/dry-run preview provenance in the migration pipeline.

## 2. Report verification

- [x] 2.1 Add unit tests for report directory layout, metadata privacy, hierarchy, comparison UI, escaping, and JSON download.
- [x] 2.2 Update integration and terminal progress tests for HTML report paths and verify dry-run remains mutation-free.

## 3. Public project tooling

- [x] 3.1 Add root agent instructions enforcing the complete OpenSpec lifecycle and secret/runtime-data boundaries.
- [x] 3.2 Replace ESLint with configured Biome linting, add Knip analysis, and resolve all findings.
- [x] 3.3 Add aggregate project checks and public repository/package metadata while retaining MIT licensing and ignored report output.

## 4. Documentation and visual identity

- [x] 4.1 Generate, inspect, and save an original full-width thematic README header image in the repository.
- [x] 4.2 Rewrite README with a concise purpose, quick-start checklist, dry-run/live commands, report guidance, and local development commands.

## 5. Validation and completion

- [x] 5.1 Run typecheck, Biome, Knip, tests, build, release checks, and strict OpenSpec validation; fix every actionable failure.
- [x] 5.2 Sync delta specifications into the main specs, archive this change, and validate all OpenSpec content again.

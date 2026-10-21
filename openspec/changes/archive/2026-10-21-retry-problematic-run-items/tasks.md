# Tasks

## 1. Retry Evidence and Planning

- [x] 1.1 Add safe invocation, retry lineage, and per-object provenance fields to report/state contracts while retaining current files; verify schema and state tests cover old and new records
- [x] 1.2 Implement strict full-report loading, request reconstruction, lineage resolution, and identity/path validation; verify valid, legacy-current, missing, corrupt, dry-run, and mismatched inputs
- [x] 1.3 Implement the typed object-level retry planner and dependency closure; verify the complete status/issue matrix, blocked chains, contexts, and current policy overrides

## 2. Public Retry Command

- [x] 2.1 Add `ywtc retry <run-id>` and its four documented short/long options; verify help, parsing, canonical UUID rejection, and absence of migrate-only overrides
- [x] 2.2 Implement retry command orchestration, no-action exits, signals, progress, report opening, and continuation output; verify codes 0/1/2/130/143 and live-lineage selection
- [x] 2.3 Update README CLI, state, and report guidance without duplication; verify every documented command and alias matches packaged help

## 3. Targeted Remote Execution

- [x] 3.1 Add retry execution plans to the migration pipeline and refresh only selected source payloads or incomplete discovery; verify successful independent pages are not read or written
- [x] 3.2 Seed and verify ancestor context, promote missing mappings, and process selected pages plus causal descendants top-down; verify recovery and blocked dependency behavior
- [x] 3.3 Filter page, resource, and comment work at object granularity while preserving current rendering and verification guarantees; verify page-only, resource-only, comment-only, source drift, and idempotent repeat scenarios

## 4. Aggregate State and Reports

- [x] 4.1 Persist retry run metadata and atomically checkpoint selected outcomes under the existing state lease; verify repeated root and child IDs converge on the latest live head
- [x] 4.2 Overlay fresh results onto the full baseline report, recompute issues and summaries, and expose retry metadata in terminal, report UI, and catalog; verify carried-forward objects are not counted as attempted
- [x] 4.3 Preserve dry-run lineage isolation and interrupted retry continuation; verify preview reports do not advance the live head and signal reports resume safely

## 5. Targeted Filesystem Export

- [x] 5.1 Patch matching managed Markdown/HTML exports through staging and atomic promotion while reusing complete payloads; verify selected page/resource/comment updates and full link integrity
- [x] 5.2 Rebuild when no safe baseline exists, reject unmanaged output, and regenerate optional ZIPs without overwriting older archives; verify each fallback and rollback path

## 6. Integration and Release Readiness

- [x] 6.1 Add cross-direction integration and package smoke coverage for retry help, planning, dry-run, repeated live attempts, filesystem output, privacy, and no-deletion guarantees
- [x] 6.2 Run `npm run check`, fix every failure, and confirm strict OpenSpec validation before archival

## Workflow follow-up

- Archive `retry-problematic-run-items`, run strict specification validation again, create `feat(retry): rerun unresolved migration outcomes`, push `master`, and verify the Release Please 4.2.0 flow.

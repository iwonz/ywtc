# Tasks

## 1. Durable source inventory

- [x] 1.1 Implement a strict unversioned atomic inventory snapshot store with manifest lifecycle and owner-only file-per-page checkpoints; verify unit tests cover compatibility, corruption, fresh generations, retirement, and path containment.
- [x] 1.2 Integrate reusable page-detail checkpoints into Yandex and Confluence subtree hydration and linked discovery where immutable targets are known; verify adapter/graph tests cover retained IDs, additions, removals, locator drift, and incompatible options.
- [x] 1.3 Persist and restore complete resource, normalized-document, and comment inventory records through the ordinary migration maps; verify an interrupted/failed preflight retries only missing pages and produces the same inventory totals as a fresh run.

## 2. Selective recovery and diagnostics

- [x] 2.1 Add typed source-inventory operation errors with safe operation, status/code, endpoint, attempts, and retryability; verify Yandex attachment, grid-list, grid-read, comments, schema, and network failures are classified without secrets.
- [x] 2.2 Add bounded selective recovery waves with decreasing concurrency and injected test delays; verify recovered `504`/`429` operations do not rerun successful pages while exhausted required failures preserve the destination barrier.
- [x] 2.3 Keep exhausted comment inventory non-blocking while checkpointing its typed failure; verify enabled comments become partial/retryable and disabled comments make no comment calls.

## 3. Progress, reports, and lifecycle

- [x] 3.1 Expose fresh/reused/pending/recovery/remaining inventory counts and precise continuation guidance in terminal errors and report summaries; verify terminal, JSON, HTML, and catalog counts remain reconciled.
- [x] 3.2 Retain snapshots for dry-run, failed, and interrupted runs and retire them after successful live completion; verify dry-run-to-live reuse, live resume, `--fresh`, and subsequent successful-run refresh behavior.
- [x] 3.3 Update the existing README state/report guidance concisely and verify the documented behavior matches CLI output without adding a new H2 section.

## 4. Integration and quality

- [x] 4.1 Add a large-inventory regression fixture proving a late single-page `504` recovers selectively and an exhausted retry resumes from checkpoints without destination writes or duplicate objects.
- [x] 4.2 Run `npm run check`, resolve every failure without weakening gates, and confirm package/browser smoke tests plus strict OpenSpec validation pass.

## Workflow follow-up

- Archive the change after every tracked task is complete.
- Run strict specification validation again after archival.
- Synchronize with `origin/master`, commit conventionally, push, and publish the patch release through the normal Release Please workflow.

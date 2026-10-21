# Proposal

## Why

Large migrations can finish with a small number of transient page, resource, comment, or inventory failures. Repeating the full migration is safe but needlessly re-reads and re-verifies successful objects, so operators need a run-correlated way to retry only actionable outcomes until the remaining issues are demonstrably terminal.

## What Changes

- Add `ywtc retry <run-id>` with workdir, dry-run, report-opening, and concurrency controls.
- Restore the credential-free effective migration request from the selected report, follow the latest live result in its retry lineage, and reject incomplete or mismatched local evidence before provider mutation.
- Build a typed retry plan that separates actionable objects, read-only dependency context, terminal problems, and resolved outcomes without inferring retryability from message text.
- Reuse the ordinary source-authoritative transfer, resource, comment, verification, state-lock, and reporting pipelines for only the selected objects and their causal dependencies.
- Produce aggregate retry reports that retain the whole migration outcome while identifying attempted and carried-forward objects.
- Patch managed Markdown/HTML exports transactionally when possible and safely rebuild them when no complete managed export exists.
- Document the retry workflow and package it in the public CLI without changing ordinary `migrate` behavior or canonical state identity.
- Never delete source or destination content, mutate an unmanaged export, store credentials in retry evidence, or automatically retry proven ownership conflicts and permanent degradations.

## Capabilities

### New Capabilities

- `targeted-run-retry`: Run-correlated retry selection, lineage, dependency closure, execution, reporting, and terminal behavior.

### Modified Capabilities

- `wiki-migration`: Persist safe invocation and lineage metadata and expose aggregate retry outcomes through state and reports.
- `resumable-source-inventory`: Reuse and selectively refresh checkpoints for a frozen retry graph while allowing incomplete discovery to finish.
- `static-export`: Transactionally patch managed exports for targeted retry or rebuild when a complete managed baseline is unavailable.
- `project-maintenance`: Document, package, and verify the new public retry command.

## Impact

The CLI parser and dispatcher, migration runner, state and report contracts, report catalog, retry selection/execution services, filesystem exporter, report UI model, README, package smoke tests, and OpenSpec capabilities change. No new credential source, provider API, state identity input, or destructive operation is introduced.

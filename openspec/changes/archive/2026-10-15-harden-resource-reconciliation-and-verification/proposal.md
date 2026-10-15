# Proposal

## Why

Remote transfers can currently fail or be reported as failed when source attachments reuse an API display name, Confluence temporarily hides a previously confirmed page, or the destination normalizes harmless empty headings. The same gaps also make issue counts and transferred-byte totals inconsistent across state, terminal output, and reports.

## What Changes

- Identify resources by immutable source IDs and exact reference aliases, prefer filenames derived from provider download URLs, reserve destination names case-insensitively, and reconcile ambiguous uploads by size and SHA-256.
- Persist verified downloads in cache, retry failed resource mappings automatically, and rewrite every source reference to the correct unique destination resource.
- Add bounded consistency retries and non-destructive self-recovery for destination page IDs that were previously confirmed but remain missing.
- Replace exact DOM fingerprint equality with provider-aware semantic verification that accepts documented normalizations while continuing to reject lost content or structure.
- Treat empty YFM headings as safe normalization, strip terminal control codes from diagnostics, and represent YFM tree directives natively or as materialized static trees.
- Use one deduplicating issue model for terminal, state, HTML/JSON reports, and report catalog counts, with actual transferred byte sizes.
- Preserve all existing CLI commands and automatic state identity; no destination content is deleted.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `wiki-migration`: strengthen resource identity and reconciliation, consistency recovery, semantic content verification, tree rendering, and unified diagnostics.
- `static-export`: require materialized YFM tree directives in portable Markdown and HTML exports.

## Impact

The change affects provider-neutral domain/state models, Yandex and Confluence adapters, content normalization and rendering, remote migration orchestration, report generation/cataloging, filesystem export, and their tests. Existing state IDs remain stable, and state gains only optional recovery and resource metadata needed for resumable repair.

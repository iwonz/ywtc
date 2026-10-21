# Proposal

## Why

Confluence may remove serialization whitespace between adjacent block elements while preserving the complete page, but ywtc currently compares flattened text and can report these pages as failed. Error recovery can also compare the final destination body with the earlier bootstrap representation, and report bundles use a different run identifier from state, which makes a single operation harder to diagnose.

## What Changes

- Compare semantic text with explicit block boundaries so provider-only whitespace changes do not become data-loss failures while inline text remains exact.
- Verify a readable page after a late pipeline failure against the latest complete representation that ywtc attempted, falling back to bootstrap only when final rendering never completed.
- Classify semantic verification failures as verification issues instead of generic provider API failures.
- Use the state run identifier as the report bundle identifier for one-to-one correlation across terminal, state, HTML, and JSON.
- Preserve strict checks for missing text, links, resources, tables, code, headings, and other meaningful structures.
- Do not delete, rename, or rewrite existing destination objects outside the ordinary source-authoritative mapped update flow.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `wiki-migration`: Stabilize provider-aware text verification, late failure recovery, verification diagnostics, and per-run report identity.

## Impact

The change affects semantic content extraction, remote page failure recovery, issue classification, report construction, and their Vitest regression coverage. It also raises the existing `markdown-it` security override to the first release outside the newly disclosed vulnerable range. It does not change CLI options, state identity, provider APIs, or destination deletion policy.

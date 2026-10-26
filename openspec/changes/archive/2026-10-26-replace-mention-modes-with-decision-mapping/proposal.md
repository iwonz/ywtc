# Proposal

## Why

Automatic destination-user resolution and configurable templates make mention migration unnecessarily unpredictable. Operators need a portable, explicit decision file and an offline editor that can be prepared without destination access.

## What Changes

- **BREAKING**: replace active `template` and `auto` policies with `off` and `mapping`, requiring `mappingFile` for the latter.
- Apply one source-bound `skip` or literal `url` decision per recognized identity to page bodies and safe comment archives; missing decisions mean skip.
- Add source-only `mentions export` producing strict unversioned JSON and an autonomous Mantine editor, including honest partial-inventory diagnostics.
- Remove destination lookup APIs, aliases, templates, and obsolete lookup retry selection while retaining historical state/report values as data only.
- Preserve canonical migration identity and use effective per-object decisions for repeatable page/comment updates.
- No live migration reruns, source/destination deletion, profile browsing, URL probes, configuration conversion, or migration guide.

## Capabilities

### New Capabilities

- `mention-decisions`: source-only mention inventory, decision document, safe bundle publication, and offline editing.

### Modified Capabilities

- `wiki-migration`: mapping-only active mention transformation, shared recognition, effective fingerprints, and historical outcome readability.
- `workspace-management`: strict modes and mapping-file validation before provider calls.
- `comment-archives`: non-notifying mapped links and decision-aware archive revision.
- `static-export`: explicit literal links or preserved source mentions.
- `targeted-run-retry`: remove retired destination-lookup work from actionable selection.
- `project-maintenance`: current documentation and offline editor/package quality gates.

## Impact

Configuration and public mention types, scanners/renderers, provider lookup removal, migration/comment fingerprinting, CLI dispatch, Vite assets, package validation, browser/unit/contract tests, README and current specifications. Existing migration mappings, reports and remote objects are not converted or deleted. Release Please must calculate major version 5.0.0.

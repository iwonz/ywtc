# Proposal

## Why

Operators need explicit, repeatable hashtag transformations without automatic taxonomy, user lookup or native labels. Reuse the source-only decision workflow while keeping mention files and semantics unchanged.

## What Changes

- Add optional off/mapping hashtag policy with source-bound skip/text/url decisions.
- Recognize bounded text hashtags and whole-link hashtags in pages and comments; protect code, URLs, anchors and markup.
- Export a private decisions JSON and offline Mantine editor through `hashtags export`.
- Apply literal presentations consistently across remote/static outputs, fingerprints and verified reporting.
- No provider labels, URL probing, source/destination deletion or automatic real migration.

## Capabilities

### New Capabilities

- `hashtag-decisions`: strict manual decisions, safe shared scanning, source-only catalog/editor, presentation and lifecycle.

### Modified Capabilities

- `workspace-management`: independent hashtag policy and source-only command configuration.
- `comment-archives`: safe hashtag decisions participate in archive fingerprints and verification.
- `static-export`: hashtag decisions and optional truthful manifest presentation totals.

## Impact

Configuration, content rendering, comments, source-only export, offline editor, optional state/report fields and operator documentation. Reuse existing dependencies. Backward compatible minor release, with full OpenSpec and publication verification.

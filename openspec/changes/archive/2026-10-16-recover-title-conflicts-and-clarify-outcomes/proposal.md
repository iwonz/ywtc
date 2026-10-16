# Proposal

## Why

Confluence can reject page creation for a space-wide duplicate title even when a preceding title lookup returns no match, causing one recoverable collision to fail a page, block its descendants, and leave their resources reported ambiguously as `planned`. Operators need collision recovery based on the authoritative create response and outcome reporting that distinguishes attempted failures from dependency-blocked or interrupted work.

## What Changes

- Recover Confluence create-time duplicate-title responses with bounded deterministic suffix allocation and verified parent-aware reconciliation.
- Reserve `planned` for dry-run outcomes and report dependency-blocked or interrupted live work explicitly across pages, resources, and comments.
- Persist causal blocking metadata, separate root errors from derived blocked objects, and reconcile the same totals across state, terminal, report JSON/HTML, and the report catalog.
- Add concise page and file status tables under the existing README Reports section without changing its fixed top-level structure.
- Improve raw-render fallbacks with recognized construct context when it is available.
- Preserve all existing destination content; no page, attachment, comment, state, or report is deleted or rewritten as a migration step.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `wiki-migration`: strengthen create-time title-collision recovery, causal outcome state, and reconciled reporting requirements.
- `comment-archives`: distinguish comments blocked by an unavailable destination page from planned dry-run and interrupted work.
- `project-maintenance`: require concise status documentation within the existing README information architecture.

## Impact

- Migration orchestration, Confluence adapters, provider error classification, state validation, issue accounting, terminal summaries, report JSON/HTML/catalog, and content fallback diagnostics.
- Contract, integration, resume, report, browser, package, and documentation tests.
- No CLI flag, automatic state identity, credential handling, or destructive behavior changes.

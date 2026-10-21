# Design

## Context

See `proposal.md` for motivation. Current verification flattens rendered HTML through DOM `text()`, so whitespace outside block elements becomes indistinguishable from meaningful inline spacing. The remote pipeline also scopes the final rendered body inside its main `try`, leaving recovery with only bootstrap content. State and report objects generate separate UUIDs.

## Goals / Non-Goals

**Goals:**

- Canonicalize block separation without weakening inline, resource, link, table, code, macro, or layout checks.
- Let late-error recovery use the most recent complete expected representation.
- Make verification failures distinguishable from transport/provider failures.
- Correlate one operation across all persisted and displayed artifacts.

**Non-Goals:**

- Pixel-level visual comparison or broader tolerance for missing content.
- Changes to automatic state identity, CLI arguments, provider contracts, or retry limits.
- Rewriting historical state or report bundles.

## Decisions

### Extract semantic text by DOM role

Semantic extraction will traverse the preview DOM in document order. It will emit explicit separators around block-level elements and line breaks, retain inline text nodes exactly, and pass the result through the existing Unicode and whitespace normalization. Scoped signatures such as list items, table cells, and layout cells will use the same extraction rule.

This is preferred to inserting spaces around every element because inline markup such as `foo<strong>bar</strong>` must remain distinct from `foo <strong>bar</strong>`. It is preferred to comparing arrays of every text node because provider wrappers may legitimately change while meaningful block order remains stable.

### Preserve the latest expected body outside the transfer try block

The page loop will initialize the recovery expectation with bootstrap content and replace it immediately after final rendering. The catch path will verify the actual destination against this value. It will not infer success from a provider fingerprint or HTTP status alone.

### Use a typed content-verification error

The assertion helper will throw a dedicated error carrying the verification result. The migrator will emit a stable `destination-content-verification-failed` issue in the verification phase for this error. Other page failures keep their existing provider/page classification.

### Inject the state run ID into the report

`TransferReport` will require a caller-supplied run ID. The migrator will pass the ID returned by `StateStore.beginRun`. This removes independent UUID generation and makes the existing report path and catalog naturally align with state history.

### Keep the production security gate green

The complete project check discovered that the existing `markdown-it` override is now in a newly published high-severity affected range. The direct dependency and override will move to `14.3.3`, the smallest release outside every reported affected range, and Diplodoc will move to its latest compatible patch. Diplodoc extensions still load two pre-14 private CommonJS paths, so the synchronous adapter load supplies those APIs from the public MarkdownIt instance only while Diplodoc initializes, then restores Node's loader immediately. The entire transformation suite will validate this narrow bridge. This is preferred to modifying installed packages, weakening the audit threshold, or accepting an advisory for source content processed by the CLI.

## Risks / Trade-offs

- **Block classification misses a provider wrapper** → Keep the boundary set explicit and cover Confluence paragraphs, headings, lists, tables, captions, layouts, macros, and line breaks with regression tests.
- **Normalization hides real inline data loss** → Emit separators only for block elements; keep inline adjacency and all structural multisets strict.
- **Late recovery marks a page partial after another late failure** → Require an actual provider read and semantic verification against the latest expected body before changing failed to partial.
- **Report constructor changes affect fixtures** → Update all direct construction sites and assert supplied identifiers in report and migration tests.
- **Diplodoc declares an older markdown-it range** → Keep the bridge and override narrowly pinned, restore the module loader in `finally`, and require all parser, renderer, migration, package, and audit gates to pass together.

## Migration Plan

Ship as a patch. Existing state mappings need no conversion; rerunning the same migration re-verifies the mapped pages and replaces the previous false failures with complete outcomes when their content is intact. Historical report directories remain unchanged.

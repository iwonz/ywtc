# Design

## Context

See `proposal.md` for motivation. The README has a fixed 13-section information architecture, so the improvement must stay inside `Возможности` and `Частые примеры`. The content claims must match the current adapter, normalized-document, renderer, fallback, and verification behavior rather than aspirational coverage.

## Goals / Non-Goals

**Goals:**

- Make content fidelity understandable before installation or migration.
- Separate positive support guarantees from explicit exclusions.
- Keep common commands copyable with the fewest required arguments.
- Leave the complete option and direction reference authoritative elsewhere in README.

**Non-Goals:**

- Change conversion, attachment, link, state, retry, or report behavior.
- Add another second-level README section.
- Turn the feature table into a format-by-format exhaustive implementation reference.

## Decisions

### Use two adjacent tables in `Возможности`

The first table describes supported source material and the destination representation. The second table is titled `Не переносится` and identifies excluded data or non-portable behavior plus the observable result. This prevents exclusions from appearing as another supported-content row and makes the boundary scannable.

Alternative considered: one table with a support-status column. Rejected because mixed positive and negative rows are harder to scan and make fallback behavior ambiguous.

### Describe attachments by API availability, not a closed extension allowlist

The transfer pipeline streams resources exposed as downloadable by the provider APIs regardless of filename extension. README therefore states that contract first and lists common image, document, archive, and office formats only as examples. It also documents actual-byte hashing and stable duplicate-name resolution.

Alternative considered: publish a fixed extension whitelist. Rejected because it would be inaccurate and become stale independently of runtime behavior.

### Explain native mappings at the construct-family level

The table names stable mappings that are directly implemented: notes/admonitions, cuts/expand, tabs/static sections, tree/children navigation, Grid/static table, Storage Format macros, resource identifiers, links, and anchors. Unsupported constructs are described through the existing fallback and raw-snapshot guarantee.

Alternative considered: enumerate every vendor macro. Rejected because unknown macros are intentionally handled generically and a large list would imply unsupported guarantees.

### Keep five common examples

Examples cover default remote subtree transfer, linked traversal, single-page transfer, static HTML export, and opening the latest report. Full direction support, profile selection, Markdown, workdir, state, fresh runs, and status filtering remain documented in their canonical tables and focused prose.

Alternative considered: retain one command for every direction and operational flag. Rejected because it duplicates the parameter reference and obscures the minimum invocation.

## Risks / Trade-offs

- [A content claim drifts from runtime behavior] → Phrase file support by API downloadability and keep mappings limited to verified renderer behavior; run repository checks and future documentation reviews against this contract.
- [A reader interprets fallback as native equivalence] → Separate native/static mappings from the not-transferred table and explicitly identify fallback/raw snapshots.
- [A less-common command is no longer copyable from examples] → Keep every option, accepted value, locator form, direction, and workspace rule in the existing parameter and compatibility sections.

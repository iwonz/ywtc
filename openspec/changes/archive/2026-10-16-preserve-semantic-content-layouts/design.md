# Design

## Context

See `proposal.md` for motivation. The existing pipeline transforms complete YFM before normalization. Diplodoc intentionally removes `{% layout %}` and `{% block %}` control lines while preserving their contents, which makes the original column boundaries unrecoverable. The same pipeline decides whether raw input is non-empty before accounting for safe removal of empty headings. Confluence Storage Format has stable `ac:layout`, `ac:layout-section`, and `ac:layout-cell` elements, while YFM has balanced layout/block directives.

## Goals / Non-Goals

**Goals:**

- Make semantic emptiness a first-class normalized property used consistently by bootstrap rendering, final rendering, verification, snapshots, reports, and file exports.
- Parse YFM layouts before Diplodoc and Confluence layouts before generic macro conversion.
- Use one provider-neutral ordered layout model and deterministic renderers in every direction.
- Preserve established retry, resume, conflict, resource, and no-deletion behavior.
- Add only mappings whose source and destination semantics are sufficiently stable to verify.

**Non-Goals:**

- Pixel-identical rendering, arbitrary CSS, scripts, third-party Confluence macros, or optional plugins.
- Inferring columns from ordinary prose or images when the source has no explicit layout markers.
- Deleting old raw snapshots or other destination attachments after a page becomes complete.
- Treating unknown macros as successful native conversions.

## Decisions

### Parse explicit layouts before generic transformation

A small line scanner will recognize balanced YFM layout/block directives outside fenced code and return ordered content and layout segments. It will preserve gap metadata, exact block order, and raw fragments. Malformed or unsupported layouts remain ordinary vendor content and produce a precise degradation. This is preferred over DOM heuristics because Diplodoc has already discarded the boundaries by the time HTML exists.

Confluence normalization will extract valid top-level `ac:layout` sections and cells before the generic macro pass. Both sources become typed layout nodes with ordered sections and cells whose contents use the existing normalized HTML/reference pipeline.

### Keep provider-safe empty serialization separate from meaningful content

`NormalizedDocument` will record semantic emptiness after safe heading removal and after typed directives/layouts are known. Whitespace, empty paragraphs, and empty headings are ignorable; anchors, rules, media, references, tables, code, macros, directives, and meaningful layout cells are not. Renderers use `''` for YFM/Markdown and `<p></p>` for Confluence/HTML wrappers as appropriate.

Verification will compare semantic models before applying the current raw-string emptiness guard. Empty expected and empty actual models are complete even when their serializations differ. A non-empty actual body for an expected empty page remains a mismatch unless it is only provider padding.

### Render native layouts only from explicit typed structure

YFM layouts with one, two, or three cells map to Confluence `single`, `two_equal`, or `three_equal` sections inside one top-level `ac:layout`; ordinary content adjacent to layouts becomes a single-cell section so Confluence's top-level layout contract remains valid. Confluence equal layouts map to YFM layout/block directives. Same-provider renderers retain their native representation.

Unequal Confluence sidebars map to ordered YFM equal columns and record a width degradation. Unsupported nesting or more than three cells is split or linearized deterministically with a raw snapshot and a precise warning. No cell content is dropped.

### Treat HTML wrappers as the portable presentation of typed layouts

Normalized layout nodes serialize to semantic `section`/`div` wrappers with ywtc-only classes. Static HTML and report previews style these wrappers as responsive CSS Grid and collapse to one column on narrow screens. Sanitization permits only those classes and no active content. Markdown emits cell contents in reading order with visible separators/headings, records a degradation, and retains a source snapshot.

### Make only stable native mappings symmetric

The Confluence-to-semantic pass will recognize code, expand, info/tip/warning/note, anchor, children, task-list, image, attachment, and page link structures. The YFM renderer will emit notes, cuts, tree directives, GFM task items, fenced code, anchors, images, and links. Existing YFM-to-Confluence mappings remain authoritative. Tabs remain static because Confluence has no standard built-in tab macro; dynamic grids remain static tables; unknown macros remain fallbacks.

This explicit allowlist is preferred over name-based macro guessing: it avoids creating invalid storage or claiming fidelity for app-provided macros.

### Include layout structure in semantic fingerprints

Semantic comparison will include ordered section types, cell counts, and per-cell meaningful fingerprints. Provider padding, namespace/attribute order, and empty cells normalize safely; a missing, reordered, or flattened supported cell is a layout difference. Missing cell data fails verification, while a documented representational width simplification is partial.

### Preserve resume and conflict semantics

No state identity or CLI contract changes. Cached normalized documents are rebuilt during inventory. A previously mapped destination that still matches the last verified ywtc fallback is safe to update to the newly rendered empty/native-layout body. Manual destination edits remain conflicts. Existing snapshot attachments are left untouched even when no longer necessary.

## Risks / Trade-offs

- **[YFM directives inside literal examples could be misread]** → The scanner ignores fenced code and only accepts complete balanced line directives; malformed input falls back unchanged.
- **[Confluence rejects invalid layout XML]** → Emit only documented section types and exact cell counts, then read back and structurally verify.
- **[Unequal widths have no YFM equivalent]** → Preserve order and content, record width-only degradation, and retain raw source.
- **[Portable Markdown cannot express rich columns]** → Linearize explicitly, mark partial, and retain the raw snapshot instead of embedding fragile renderer-specific HTML.
- **[Verification becomes stricter for old pages]** → Accept provider-safe padding but identify real flattening; reruns update only destinations still matching ywtc-managed fingerprints.
- **[Broader macro conversion could lose vendor data]** → Limit native conversion to the allowlist and retain current fallback behavior for everything else.

## Migration Plan

1. Ship as `3.6.0` with no configuration, CLI, or state migration.
2. Existing runs reuse their state. Pages with managed empty-heading fallbacks or flattened layouts are re-rendered and updated when conflict checks permit.
3. Rollback is the previous npm/Homebrew version; no destination content is deleted. Pages already improved remain valid provider-native content.

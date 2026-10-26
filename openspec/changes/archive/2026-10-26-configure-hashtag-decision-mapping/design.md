# Design

## Context

Mention decisions already provide source discovery, private publication and an offline Mantine editor. Hashtags add literal text decisions and case-sensitive textual identity, not provider labels.

## Goals / Non-Goals

Implement the approved off/mapping policy and source-only catalog across all destinations. Preserve mention documents and behavior. Do not probe URLs, manage labels, delete provider objects or run real migrations.

## Decisions

- Share source-only traversal/publication and editor primitives, retaining separate validators and documents for mentions and hashtags.
- Use a forward scanner for YFM with protected syntax ranges and structural text-node scanning for storage. Whole-link hashtags are atomic; mixed labels are excluded. Markers have source-derived namespaces and only original source tags are eligible.
- Prepare rendering-only clones with protected changed hashtags, then insert escaped literal presentations after existing link/resource/mention rewriting. Off/skip do not mask source text. Source inventory/cache remain presentation-independent; legacy documents can be scanned from their original raw body.
- Fingerprints include effective page/comment decisions, not catalog metadata. Optional report/state fields record presentation counts separately from existing page/comment verification and retry outcomes. No new conflict producer or state identity.
- Reuse offline Mantine primitives with a hashtag variant and strict validator; embedded initial JSON, explicit import, safe serialization and CSP remain mandatory.

## Risks / Trade-offs

Markup boundaries and literal insertion require tests for headings, anchors, macro/code bodies, URLs, existing links, mention independence and megabyte strings. Rendering clones must preserve grid/diagram nodes and never modify cached source snapshots. Shared UI changes must preserve existing mention browser tests.

## Verification and Delivery

Test-first parser/policy/export/rendering/CLI/editor integration; full quality gates, package/browser tests and strict validation before/after archive. Update canonical README and affected integration specifications. Publish a minor through Release Please and verify supported channels without a private migration.

# Proposal

## Why

The README currently mixes supported and unsupported content in one terse table and lists uncommon command variants with redundant options. Readers need a precise, maintainable view of content fidelity and a smaller set of genuinely frequent commands.

## What Changes

- Expand the existing `Возможности` section with concise, concrete mappings for structure, formatting, links, anchors, downloadable attachments, images, Yandex constructs, Confluence macros, and loss-aware fallbacks.
- Add a separate compact table in the same section that states what is outside the transfer contract and how ywtc reports or preserves those cases.
- Reduce `Частые примеры` to the common operational workflows and omit optional flags whenever automatic profile selection or defaults are sufficient.
- Keep detailed option combinations canonical in `Параметры` instead of repeating them in examples.
- Do not change CLI behavior, supported content, runtime data, or release interfaces.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `project-maintenance`: Refine the public README contract so content support and exclusions are separately explicit while frequent examples remain minimal and non-duplicative.

## Impact

- Affected files: `README.md` and the `project-maintenance` specification.
- No API, CLI, dependency, configuration, state, or runtime behavior changes.
- No source or destination content is mutated.

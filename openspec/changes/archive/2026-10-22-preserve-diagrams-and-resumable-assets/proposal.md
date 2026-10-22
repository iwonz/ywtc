# Proposal

## Why

Yandex Wiki can embed complete Draw.io diagrams as large inline data URIs and can contain Mermaid, PlantUML, and other diagram sources that are not returned by the page-resource API. The current bounded YFM guard prevents a pathological Diplodoc parse but silently substitutes such diagrams with a generic marker, while interrupted large downloads restart from byte zero; together these behaviors can lose useful content, produce false `complete` outcomes, and waste substantial transfer time.

## What Changes

- Discover supported embedded diagram constructs before vendor parsing, validate and fingerprint their payloads, and represent them as typed document nodes plus synthetic managed resources.
- Preserve diagram source and a safe visual or readable representation in every destination; use a proven native provider representation when available and record a complete adaptation otherwise.
- Make verification account for every discovered diagram source, visual representation, and reference so omitted or corrupt diagrams cannot be reported as complete.
- Resume interrupted source downloads from stable partial files when the provider proves byte-range continuity; safely restart when it does not.
- Improve diagnostics for destination attachment-size limits and retain a usable source reference plus exact retry/action metadata when a provider refuses a resource.
- Keep the transfer non-destructive: no source or destination objects are deleted, and unsupported native diagram macros are never guessed or emitted speculatively.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `wiki-migration`: Add loss-aware diagram discovery/rendering/verification and resumable large-resource transfer behavior.
- `static-export`: Preserve diagram sources and offline visual/readable representations in Markdown and HTML exports.
- `project-maintenance`: Cover diagram fixtures, resumable byte-range transport, package contents, and public documentation in release checks.

## Impact

- Affects the normalized content model, Yandex/Confluence source parsing, remote and filesystem renderers, resource cache/download pipeline, verification, state/report diagnostics, and README supported-content documentation.
- May add a narrowly scoped diagram-rendering dependency only if it is required for a deterministic safe preview and passes package/security checks.
- Does not change existing CLI options, state identity, deletion policy, or provider authentication.

## Why

The README parameter table describes `--source` and `--target` generically, but operators still have to infer which concrete Yandex Wiki and Confluence URL shapes the parser accepts. Keeping the examples in the existing table provides one authoritative CLI reference without adding a duplicate section.

## What Changes

- Expand the `--source` table row with accepted slug, slash-normalized slug, and absolute Yandex Wiki URL examples.
- Expand the `--target` table row with accepted numeric ID, `viewpage?pageId`, ID-in-path, modern spaces/pages, and display URL examples.
- Add one concise validation note that rejects Markdown link syntax, Yandex page IDs as source, and Confluence space-only URLs as target.
- Keep the quick-start examples and all CLI behavior unchanged.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `project-maintenance`: Require concrete accepted and rejected `--source` and `--target` examples in the existing CLI reference.

## Impact

- Documentation: `README.md`.
- Specification: `openspec/specs/project-maintenance/spec.md` after archival.
- No runtime, API, dependency, credential, state, or destructive-operation changes.

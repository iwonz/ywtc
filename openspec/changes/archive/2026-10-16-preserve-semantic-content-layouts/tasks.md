# Tasks

## 1. Semantic content model

- [x] 1.1 Add semantic-empty classification after safe provider normalization and verify whitespace/empty-heading/container-page fixtures remain empty while anchors, media, directives, and layout content remain meaningful.
- [x] 1.2 Add a fenced-code-safe balanced YFM layout scanner plus provider-neutral ordered section/cell nodes and verify multiple layouts, adjacent content, malformed directives, code examples, gaps, and cell order in unit tests.
- [x] 1.3 Parse Confluence `ac:layout` into the same normalized structure and verify all documented section types, exact cell counts, ordinary surrounding content, and invalid-layout fallback cases.

## 2. Native rendering and verification

- [x] 2.1 Render normalized YFM layouts to valid top-level Confluence `ac:layout` storage and verify single/two/three-column conversion, links, images, formatting, and no regression in existing conversion tests.
- [x] 2.2 Render Confluence layouts and the safe macro allowlist to YFM, preserve same-provider constructs, and verify notes/callouts, cut/expand, tree/children, tasks, code language, anchors, links, images, and attachments in both directions.
- [x] 2.3 Extend semantic fingerprints and destination verification for empty bodies and ordered layouts; verify safe provider padding is complete while flattened, reordered, or missing meaningful cells are partial/failed as appropriate.
- [x] 2.4 Ensure remote migration accepts provider-safe empty output without fallback/snapshot and repairs a prior managed fallback on resume; verify migration integration tests produce `complete` and preserve descendants/conflict protection.

## 3. Static and report presentation

- [x] 3.1 Render layouts as responsive semantic grids in static HTML and report previews, add narrow-viewport behavior, and verify browser tests show retained column order without active content or external requests.
- [x] 3.2 Linearize layouts explicitly for Markdown with a precise degradation and raw snapshot while keeping semantically empty exports fallback-free; verify filesystem export manifest/status and generated files.

## 4. Documentation and integration quality

- [x] 4.1 Update the existing README `Возможности` and limitations tables with semantic-empty behavior and the current bidirectional equivalence matrix; verify the fixed thirteen-section information architecture remains unchanged.
- [x] 4.2 Run focused conversion, content-model, migration, export, and browser tests, then run `npm run check` and verify all project quality gates pass.

## Workflow follow-up

- Archive the OpenSpec change and run strict validation against the synchronized main specifications.
- Commit with Conventional Commit subject `feat(migration): preserve empty pages and native layouts`, push `master`, and verify the `3.6.0` release through GitHub, npm/npx, and Homebrew.

## 1. Contracts and configuration

- [x] 1.1 Add maintained CLI, queue, YAML, document, archive, and test dependencies, adopt Node.js 24/npm 11.5.1 as the runtime baseline, and remove superseded runtime helpers.
- [x] 1.2 Implement named connection profiles, secret references, workspace templates, locator/profile resolution, and generalized configuration validation.
- [x] 1.3 Define provider-neutral page, resource, normalized-document, adapter, graph, result, and capability types.
- [x] 1.4 Implement state schema v2, canonical endpoint identity, lifecycle/status checkpoints, v1 diagnostics, cancellation, and conflict fingerprints.

## 2. Provider adapters and discovery

- [x] 2.1 Extend Yandex Wiki with source graph/resource reads and destination page/update/upload-session/verification operations.
- [x] 2.2 Extend Confluence Data Center and Cloud with source page/child/link/attachment download operations and generalized destination messages.
- [x] 2.3 Implement adapter factories and direction-specific capability preflight for all four remote directions.
- [x] 2.4 Implement deterministic `page`, `subtree`, and transitive `linked` discovery with canonical deduplication, edge statuses, cycle handling, and hierarchy projection.

## 3. Content and destinations

- [x] 3.1 Implement the normalized document parser for YFM and Confluence Storage including references, attachments, grids/macros, vendor extensions, and degradation accounting.
- [x] 3.2 Implement Confluence Storage and YFM renderers with rewritten page/resource/anchor references, safe fallbacks, and raw source snapshots.
- [x] 3.3 Implement Markdown and sanitized static HTML renderers with portable navigation and relative references.
- [x] 3.4 Implement filesystem destination staging, ownership manifest, backup/restore, integrity verification, streamed attachments, and optional streamed ZIP.
- [x] 3.5 Replace the hard-coded migrator with the universal two-pass transfer orchestrator, streaming cache, resume/conflict behavior, destination verification, and dry-run guarantees.

## 4. CLI, observability, and documentation

- [x] 4.1 Replace legacy argument parsing with the new `--destination`, profile, scope, format, and archive interface plus actionable legacy diagnostics.
- [x] 4.2 Implement bounded scheduled work, graceful signals, TTY/non-TTY progress, stable exit codes, and consistent final summaries.
- [x] 4.3 Generalize HTML/JSON reports for directions, hierarchy, graph edges, cycles, comparisons, resources, degradations, conflicts, and filesystem outputs.
- [x] 4.4 Update README, `.env.example`, profile template, package metadata, compatibility/direction tables, examples, state guidance, and v2 migration guide.

## 5. Verification and release readiness

- [x] 5.1 Add unit tests for profiles/locators, option validation, state v2, graph cycles, hierarchy projection, normalized conversions, and safe paths.
- [x] 5.2 Add mocked provider contract and integration matrix tests for four remote directions, two export formats, retries, errors, resume, conflict, and cancellation.
- [x] 5.3 Add golden/static-browser and performance/streaming checks, and validate packed npm CLI contents.
- [x] 5.4 Run `npm run check`, resolve all findings without broad ignores, and review tracked/package files for secrets or runtime data.
- [x] 5.5 Finalize the complete specification deltas and prepare the validated change for archival and the breaking Release Please 2.0.0 commit.

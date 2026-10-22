# Tasks

## 1. Diagram discovery and model

- [x] 1.1 Add failing scanner tests for large inline Draw.io, Mermaid, PlantUML, D2, malformed payloads, stable identities, and bounded runtime; verify the focused Vitest file fails for the missing behavior
- [x] 1.2 Implement the linear diagram scanner, embedded-resource descriptors, and normalized diagram nodes; verify the focused scanner and content-model tests pass
- [x] 1.3 Add synthetic-resource materialization with offset/hash validation and tests proving large payloads are not copied into state/report metadata

## 2. Rendering and verification

- [x] 2.1 Add failing golden tests for Yandex, Confluence, Markdown, and HTML diagram representations, including native preservation and safe source-preserving adaptations
- [x] 2.2 Implement diagram-aware remote/static renderers, stable relative references, preview sanitization, notices, metrics, and report inventory; verify the golden and report-contract tests pass
- [x] 2.3 Extend semantic verification so missing or mismatched diagram artifacts reject `complete`; verify complete adaptations and true degradations in focused migration tests

## 3. Large resource resilience

- [x] 3.1 Add failing Yandex client tests for interrupted transfers, valid `206` resume, ignored ranges, validator drift, `416`, cancellation, and final size/hash validation
- [x] 3.2 Implement stable partial checkpoints and strict range-resume/restart behavior; verify focused client tests and heap-safe streaming checks pass
- [x] 3.3 Add typed attachment-limit diagnostics and cache/source fallback tests proving a provider `413` is actionable, retry-safe, and never reported as a complete resource

## 4. Product integration

- [x] 4.1 Update README supported-content and limitation tables for diagram formats, native/adapted behavior, large-resource resume, and provider size limits; verify documented claims match tests and current CLI behavior
- [x] 4.2 Extend package smoke and hygiene checks for isolated diagram/resource fixtures and verify runtime payloads, partial files, reports, and internal data are excluded from the tarball
- [x] 4.3 Run focused integration tests followed by `npm run check`, verify strict OpenSpec validation, and mark every completed task before archive

## Workflow follow-up

- Archive `preserve-diagrams-and-resumable-assets` after all tracked tasks and project checks pass.
- Re-run strict OpenSpec validation after archive, create a Conventional Commit, synchronize with `origin/master`, push, and verify the release workflow.

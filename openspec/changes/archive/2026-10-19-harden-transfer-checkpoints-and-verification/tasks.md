# Tasks

## 1. Durable page ownership and update recovery

- [x] 1.1 Checkpoint confirmed create/read-back page identity before strict semantic classification and verify regression tests retain the mapping after verification failure.
- [x] 1.2 Strengthen deterministic orphan-candidate recovery and verify a rerun adopts one semantically compatible child without modifying unrelated candidates or creating a duplicate.
- [x] 1.3 Add bounded refresh-and-retry for a `403` on a proven mapped final update, improve the redacted diagnostic, and verify persistent rejection preserves readable bootstrap content.

## 2. Isolated conversion and semantic fidelity

- [x] 2.1 Route every Diplodoc transform through an invocation-local diagnostic wrapper and verify sequential transformations cannot leak warnings or degradations.
- [x] 2.2 Canonicalize meaningful blocks, empty scaffolding, legacy style tokens, and generated anchors in provider-aware verification and verify meaningful text, links, table cells, code, and resources still fail when lost.
- [x] 2.3 Preserve meaningful Confluence attachment-image alternative text through a readable verified fallback and verify filename-equivalent labels remain uncluttered.

## 3. Reliable resources and accounting

- [x] 3.1 Retry complete Yandex response streams through isolated temporary files, publish only completed hashes, and verify an aborted first attempt succeeds without a partial cache artifact.
- [x] 3.2 Treat ambiguous unitless decimal resource sizes as unknown until download and verify source/transferred byte reporting uses actual persisted bytes.
- [x] 3.3 Replace message-derived transformation issue identities with stable codes and verify report deduplication preserves affected-object detail.

## 4. Integration and delivery validation

- [x] 4.1 Run focused migration, conversion, Yandex client, report, and content-safety tests and verify all new regression cases pass.
- [x] 4.2 Run `npm run check`, package/browser smoke checks, and strict OpenSpec validation and resolve every failure.

## Workflow follow-up

- Archive the OpenSpec change after all tracked tasks and project checks pass.
- Re-run strict OpenSpec validation after archive.
- Synchronize with `origin/master`, create the conventional patch commit, push it, and verify the release automation state.

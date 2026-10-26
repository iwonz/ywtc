# Design

## Context

See proposal.md. Existing orchestration assumes one real page root in discovery, reports and remote staging. Confluence clients only resolve page locators; Yandex already accepts personal slugs. Preserve existing page-root identities and pipeline behavior.

## Goals / Non-Goals

Support page and space source roots with complete selected-page inventory and a separate resumable section. Do not add destination-space locators, new auth, browser scraping, blogs, ACL copying, deletion or automatic private transfers.

## Decisions

- Add a discriminated source root and a space descriptor with immutable ID/key, name, URL and optional homepage. Keep page resolution for ordinary references and destination semantics unchanged.
- Space subtree uses exhaustive Data Center space content/page enumeration or Cloud REST v2 space pages, validating details and membership. Page/linked use the homepage; absent homepage fails those scopes only. Linked references to spaces resolve their homepage, not all space pages.
- Keep real source pages separate from a generated section. The execution boundary uses an explicitly typed container work item for existing allocation/recovery machinery, never sends its ID to source page/resource/comment APIs, and excludes it from source and outcome page counters. Its mapping/status is separately persisted and reported.
- Space identity uses `space:<immutable-id>`; ordinary page identities are byte-for-byte unchanged. Equivalent URLs and homepage/name changes reuse the same state; page and space roots are intentionally different identities.
- Effective request evidence uses the canonical space-entry path, not a raw `key` query parameter that secret redaction would mask. Existing query-key redaction remains unchanged.
- Real parent chains are derived from enumerated IDs and available ancestors. Top-level branches attach to the section without false gaps; unavailable intermediate parents record gaps. Validate the complete selected graph before any remote mutation.
- Reuse verified section mappings on retry and restore only frozen actionable pages plus read-only dependencies. Missing section recovery follows existing bounded safe allocator rules. One section failure blocks dependents causally, not as independent errors.
- Static exports generate a navigation index and separate manifest container metadata. Reports and terminal use space coverage wording, real-page totals and a separate section row. Source-only mention export filters out container work items entirely.
- Current completeness, notices, run status, retryability and exit-code semantics remain independent and unchanged. Normal provider failures are never ownership conflicts.

## Risks / Trade-offs

- API permission filtering cannot reveal hidden pages: report accessible scope only.
- Homepage is mutable: space ID, not homepage ID, owns state and section.
- Existing root assumptions span several consumers: integration tests must reconcile empty/nonempty counts, source API boundaries, exports and retries.
- Partial discovery must retain page stubs and checkpoint evidence; no silent omission or writes after required failures.

## Delivery

Use neutral fixtures, strict OpenSpec validation, full check/package/browser gates, archive, and audited Conventional Commit. Publish through Release Please as the next minor; verify GitHub, npm/npx and Homebrew without running a real migration.

## Context

The current command parser, configuration, state, report, and `Migrator` encode Yandex Wiki as the only source and Confluence as the only destination. Both vendor clients already contain useful retry, pagination, redaction, and rate-limit behavior, but their public interfaces are asymmetric. The change must add bidirectional remote transfer and filesystem export without weakening dry-run, resumability, TLS, or secret hygiene.

## Goals / Non-Goals

**Goals:**

- One provider-neutral discovery and transfer pipeline for Yandex Wiki, Confluence, Markdown, and HTML destinations.
- Deterministic page graph traversal, hierarchy projection, cycle safety, and state v2 resume behavior.
- Maximum semantic fidelity with explicit fallbacks and source snapshots instead of silent loss.
- Streamed resources, bounded queues, graceful cancellation, actionable terminal output, and post-write verification.

**Non-Goals:**

- Page history, comments, permissions, users, watchers, active scripts, and executable embedded applications.
- Automatic deletion, implicit adoption of unrelated destination objects, or automatic v1 state conversion.
- Crawling browser chrome, comments, links hidden inside binary files, or URLs outside the configured organization/origin.

## Decisions

### Named profiles and locators

`ywtc.config.yaml` stores non-secret named Yandex Wiki and Confluence connection metadata; each profile references token/email environment variable names loaded from `<workdir>/.env` with process values taking precedence. Full URLs select the unique longest matching base URL profile. Short IDs/slugs require an explicit profile unless exactly one compatible profile exists. A filesystem destination is selected only when `--format markdown|html` is present, eliminating path/slug ambiguity.

### Adapter boundaries

Sources expose canonical resolution, page reads, children, links, resources, and streaming downloads. Remote destinations expose container resolution, skeleton creation, body updates, resource uploads, URLs, and verification. Filesystem destinations implement the same write stages locally. Capability preflight is direction-specific so source credentials require read capabilities and destination credentials require write capabilities only.

### Normalized document model

The pipeline uses a typed provider-neutral document containing structural nodes, page/anchor/resource references, and vendor-extension nodes. YFM is normalized through Diplodoc output and semantic HTML parsing; Confluence Storage XML is parsed namespace-aware. Renderers produce YFM, Confluence Storage, GFM Markdown, or sanitized static HTML. A renderer must account for every node as native output, readable fallback, or a degradation whose raw source snapshot is retained.

### Graph discovery and projected hierarchy

`page` selects only the root, `subtree` selects its structural descendants, and `linked` performs deterministic breadth-first traversal of internal page references until a fixed point. Canonical keys combine profile, provider, and immutable page ID, so aliases, redirects, diamonds, and cycles enqueue a page once. Source parents are retained when selected; otherwise linked pages attach under the migrated root. Discovery finishes before destination mutation and rejects a destination that belongs to the selected source graph.

### State, conflicts, and resume

State v2 stores canonical endpoint identity, provider-neutral page/resource mappings, graph edges, fingerprints, per-object status, and run lifecycle. Its automatic ID excludes locator spelling and scope so expanding a prior selection can reuse valid mappings. Existing destination objects are updated only through prior mappings. A changed destination fingerprint becomes a conflict rather than being overwritten. State v1 is rejected with migration guidance and is never deleted.

### Static export transaction

Markdown and HTML render into an adjacent staging directory. Replacement is allowed only for a directory containing a matching ywtc manifest; the old export is renamed to a timestamped backup before the staged tree is committed, and restored if commit fails. `--archive` streams a uniquely named ZIP after successful commit and keeps the directory. HTML contains local CSS and relative links, works from `file://`, and does not execute source scripts.

### Scheduling, cancellation, and UX

Commander validates the command surface, Listr2 renders TTY/non-TTY progress, and PQueue provides bounded concurrency, interval rate limits, backpressure, and AbortSignal propagation. Raw pages are cached under the ignored workdir rather than retained for the whole run. SIGINT/SIGTERM stops new work, drains safe in-flight operations, flushes state/report atomically, and exits with the conventional signal code.

### Retry and verification

Existing bounded exponential retry behavior remains for 429, Retry-After, transient network errors, and 5xx responses. Remote pages and resource inventories are re-read after writes. Filesystem output is checked for manifest integrity and broken relative references. Missing data, verification failures, resource failures, and unrepresented nodes produce `partial` and a non-zero exit; independent items may continue.

## Risks / Trade-offs

- **Linked scope can select a very large graph** → show live discovery totals, persist discovery state/cache, rate-limit by profile, and perform no writes until selection freezes.
- **Vendor formats are not isomorphic** → preserve semantic fallbacks and attach/store raw source only for degraded pages.
- **Remote APIs are not transactional** → create skeletons first, checkpoint every mutation, never delete, and make reruns idempotent through mappings.
- **Markdown cannot represent every rich construct** → use GFM plus safe embedded HTML where portable, and record remaining degradation.
- **Filesystem replacement can fail mid-rename** → stage on the same filesystem, retain the prior backup, and restore it on failure.
- **API schema drift** → accept additive fields, validate required structures at adapter boundaries, and report the endpoint/capability precisely.

## Migration Plan

1. Introduce profile configuration, locators, shared types, state v2, and adapter contracts while tests still isolate vendor clients.
2. Add source capabilities to Confluence, destination capabilities to Yandex Wiki, graph discovery, renderers, and static destinations.
3. Replace the CLI/progress/scheduler, generalize reports, and remove legacy flags and state/config execution paths.
4. Run the complete direction/scope/export matrix, archive the OpenSpec change, and publish the pending breaking release through Release Please.

Rollback is a normal Git revert before release. After remote writes begin, rollback never deletes created content; operators retain state/report mappings and can stop or resume safely.

## Open Questions

None. The selected defaults are subtree scope, same-instance linked traversal across Confluence spaces, staged filesystem replacement with retained backup, and ZIP as an additional artifact.

# Design

## Context

See [proposal.md](./proposal.md) for motivation. The current provider-neutral pipeline freezes page inventory, transfers source-derived bodies and resources, checkpoints an unversioned strict state, and reconciles reports through a shared issue collector. Provider adapters do not expose comments, and comment failures must be isolated from the already verified page path.

Yandex Wiki exposes paginated top-level comments, paginated thread reads, and create-only page comments. Confluence Data Center exposes comments as content and Confluence Cloud exposes separate footer/inline endpoints with create/update support. Comment attachments are not a separate durable namespace: they are page resources explicitly referenced from comment bodies.

## Goals / Non-Goals

**Goals:**

- Normalize all accessible page comments into one deterministic forest and retain every recoverable entry despite malformed reply data.
- Produce one human-readable, verifiable archive per page and one content-addressed ZIP for explicitly linked files.
- Add comment transfer without weakening page bootstrap, resource independence, conflict protection, or no-delete guarantees.
- Make reruns idempotent on update-capable and append-only destinations.
- Reconcile terminal, state, filesystem manifest, and report counts from the same comment result.

**Non-Goals:**

- Recreate original identities, permissions, reactions, notification behavior, or original comment timestamps as destination metadata.
- Read comments attached to attachments, blog posts, or custom content.
- Discover linked-scope pages from links found only in comments.
- Delete or rewrite source comments, superseded destination revisions, stale archives, or unrelated attachments.

## Decisions

### Comments are an optional capability layer over the page pipeline

`SourceAdapter` exposes `readComments(page)` and comment-read capability. `DestinationAdapter` exposes list/create/read plus optional update for archive comments. The orchestrator invokes this layer only when the resolved CLI option is true and after the page body and ordinary resources are available. This keeps comment failures from preventing first-write content guarantees. Treating comments as ordinary page body nodes was rejected because remote destinations require a real comment object and independent conflict history.

### Inventory errors are page-local results

Page details and body discovery remain mutation gates, but each comment read resolves to `complete`, `empty`, or `failed` inventory. Failed comment inventory adds a deduplicated issue and the main transfer continues. This intentionally differs from an incomplete page inventory because inaccessible discussion must be visible as partial without suppressing otherwise safe content.

### The normalized forest is built defensively

Entries are deduplicated by provider and immutable comment ID. Replies are ordered by provider order and stable timestamp/ID fallbacks. Missing parents become deterministic top-level orphan branches; ancestry cycles are broken at the repeated edge and recorded. Authors retain only API-visible fields, with a provider-ID identity key and a presentation fallback chain. Reactions are discarded during normalization.

### Rendering uses a canonical semantic archive

A canonical Markdown-like representation supplies fingerprinting and fallback. Provider renderers transform each top-level branch to Confluence `expand`, YFM `cut`, Markdown `<details>`, or semantic HTML `<details>`. Internal page references reuse existing mapping logic without affecting graph discovery. A native-render failure retries a nested quote and then escaped code body so recovered text is never silently omitted.

### Comment attachments are selected by exact parsed links

The comment parser emits explicit link/image references, which are matched against the page resource exact-alias index. Plain text is never treated as a file. Ambiguous or missing references stay absolute and add an issue. Selected files reuse the verified resource cache where possible, otherwise stream through the existing downloader while computing SHA-256 and actual size.

### ZIP identity is content-derived and deterministic

Unique bytes are keyed by SHA-256. Archive names start with twelve hash characters plus a sanitized original name; colliding prefixes extend until unique. Files and `manifest.json` are emitted in lexical order through Archiver with fixed entry timestamps and modes. The ZIP name includes a safe page key and normalized comment fingerprint. The manifest records source comment ID, original reference/name, archive name, size, and SHA-256.

### Remote ZIPs reuse destination resource reconciliation

The ZIP and oversized Markdown fallback are synthetic page resources with stable source identities. They pass through existing upload/list/hash/name reconciliation, so interrupted responses and reruns cannot create uncontrolled duplicates. Filesystem output writes them into the page attachment directory inside staging. This avoids a second attachment subsystem.

### State stores optional comment records without a version branch

Each page may contain a comment record with normalized fingerprint, source counts, lifecycle status, destination ID and fingerprint, prior IDs, archive resource mapping, issues, preview, and last error. Absence means not yet processed, not an older schema. The flag is excluded from automatic state identity, allowing `--no-comments` followed by the default run to enrich the same transfer.

### Update and conflict behavior follows destination capability

Confluence comments are updated only when a read-back fingerprint matches the previously checkpointed destination fingerprint; otherwise they become conflicts. Yandex append-only comments get a new fingerprinted revision and a replacement note. A missing mapped comment is recreated. A missing source discussion never deletes an existing archive and becomes stale. Recreating a destination page clears only its comment mappings so the archive can be rebuilt from cache.

### Verification is semantic and provider-aware

Read-back verification compares header/source URL, fingerprint, top-level thread count, participant identities available in text, nested entry text/status, attachment placeholders, and ZIP/Markdown link. Allowed provider markup normalization is ignored; missing discussion text or archive references fail comment verification. The actual read-back body is saved for report preview.

### Preflight is strict for reads and advisory for writes

When enabled, a source must advertise/read comments; otherwise preflight explains `--no-comments`. Destination create/update capability is inferred from deployment contracts and read-only probes. Inability to prove write permission is a warning because probing must not create data; an actual write denial becomes a page-local partial result.

## Risks / Trade-offs

- **[Provider pagination or reply shapes drift]** → Tolerant response schemas accept additive fields while mandatory identity/body/thread structures produce endpoint-specific issues.
- **[Very large discussions exceed API limits]** → Preserve the full archive as a streamed Markdown attachment and post a compact index; mark partial rather than truncating.
- **[ZIP determinism varies by compression implementation]** → Fix ordering and metadata, fingerprint source files/manifest rather than relying only on ZIP bytes, and test repeated output hashes.
- **[Comments reveal API-visible email addresses]** → Store only fields returned to the configured token, redact configuration identity in operational errors, and document that archive content intentionally preserves source-visible attribution.
- **[Append-only destinations accumulate revisions]** → Fingerprints prevent unchanged duplicates; changed revisions are explicitly linked and never deleted.
- **[Comment work increases request volume]** → Reuse provider queues, rate buckets, cache, pagination guards, and bounded concurrency; comment links never expand the page graph.

## Migration Plan

1. Add optional state fields and CLI flags first so current state files remain readable.
2. Add provider reads and normalized/golden tests, then destination writes and verification.
3. Integrate ZIPs through resource reconciliation and filesystem staging.
4. Add progress/report/docs and run the full compatibility matrix.
5. Archive the OpenSpec change after checks; release as the next minor version through existing Release Please automation.

Rollback consists of reverting the release. Existing optional comment state and created archive objects remain intact and are ignored by the earlier binary; no automated deletion is performed.

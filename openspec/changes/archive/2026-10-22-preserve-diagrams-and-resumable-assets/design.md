# Design

## Context

See `proposal.md` for motivation. YFM normalization is synchronous and currently protects Diplodoc by replacing every whitespace-free token above 64 KiB. A Yandex Draw.io directive stores an exported SVG and its `mxGraphModel` in exactly such a token, so the safety guard also removes the only copy available to the renderer. Provider resource APIs never enumerate that payload. Ordinary attachments already stream through the cache, but a failed Yandex download uses a random temporary name and deletes it before retrying.

The common pipeline requires inventory to finish before remote mutation, stores normalized documents in the source-inventory checkpoint, and binds resource aliases only after upload/export. Any solution must keep those properties, avoid embedding large base64 strings in state/report JSON, and remain safe when a destination has no diagram plugin.

## Goals / Non-Goals

**Goals:**

- Recognize embedded Draw.io plus Mermaid, PlantUML, and D2 sources without pathological regular expressions.
- Give each diagram a stable identity, explicit normalized node, complete/adapted/degraded outcome, and verifiable destination representation.
- Treat inline Draw.io SVG as a managed synthetic resource using offsets and hashes rather than copying its base64 payload into runtime metadata.
- Preserve retryable partial downloads between attempts and process runs without promoting incomplete bytes.
- Keep all existing directions, state identities, retry behavior, and non-destructive guarantees.

**Non-Goals:**

- Pixel-identical rendering across providers.
- Installing or configuring third-party Confluence diagram apps.
- Guessing vendor-specific macro names or storage parameters from product branding.
- Resumable Confluence multipart upload, which the supported REST contract does not expose.
- Bypassing an administrator-defined destination attachment-size limit.

## Decisions

### 1. Scan YFM before Diplodoc with a small deterministic lexer

A new diagram module scans directive boundaries, quoted attributes, and fenced-code delimiters in one forward pass. It recognizes only exact supported constructs and never applies an unbounded regular expression to the encoded payload. Unknown oversized tokens continue through the existing bounded fallback. The scan is synchronous but linear and bounded per page; it returns to the inventory scheduler's existing cooperative checkpoint rather than entering the parser's pathological backtracking path.

For inline Draw.io, the scanner validates the `data:` media type and base64 alphabet, computes decoded size and SHA-256 in fixed chunks, and records source offsets. It replaces the directive in parser input with a stable short marker. Normalization converts that marker into a `diagram` node at the same document position.

Alternative considered: increase Diplodoc's token threshold. Rejected because it restores the event-loop blocking path and still gives no resource identity or verification.

### 2. Model inline diagrams as synthetic resources without serializing payloads

`SourceResource` gains `diagram` kind and an optional embedded descriptor containing diagram kind, media type, source offsets, encoding, size, and hash. The descriptor is small and safe for inventory checkpoints. `downloadResource` receives the owning `SourcePage`; the Yandex adapter materializes only the referenced slice into the cache while recomputing size/hash. Ordinary adapters ignore the extra page argument.

The stable resource ID and filename derive from page immutable ID, ordinal, diagram kind, and content hash. The same scanner is used by resource inventory and normalization so marker aliases cannot drift.

Alternative considered: store base64 in resource metadata. Rejected because it duplicates multi-megabyte content in memory, state, and reports.

### 3. Preserve source first; use native constructs only with an exact known contract

The normalized `diagram` node contains kind, stable resource reference, source text when it is naturally textual, and display metadata. Rendering follows this matrix:

- YFM → YFM keeps recognized native Draw.io, Mermaid, and PlantUML source syntax; D2 remains a fenced source block unless the configured provider later proves a native contract.
- Confluence Storage → Confluence Storage retains existing supported macro storage and attachment references.
- Text diagrams transferred to Yandex use documented native syntax where available.
- Other cross-provider cases render a safe image/link for Draw.io SVG and a labelled code/source block for Mermaid, PlantUML, or D2. The original source remains available.
- Markdown and HTML use local relative artifacts; HTML uses an inert image/link and never executes diagram scripts.

This source-preserving fallback is an adaptation and remains `complete`. A degradation occurs only if the exact source, required managed artifact, or meaningful representation is missing or unverified.

Alternative considered: optimistically emit common Confluence macro names. Rejected because Mermaid/D2 are not built-in and Draw.io app storage contracts require correlated attachments and previews; speculative storage can make a page appear successful while rendering nothing.

### 4. Sanitize previews while retaining the original as inert data

Original diagram artifacts are never executed by ywtc. Static HTML references them through image/download semantics. A preview copy removes scripts, event-handler attributes, executable URLs, and non-local external fetches; if sanitization cannot prove safety, the renderer uses a labelled download/source block instead. Reports never include the full source payload.

The original artifact is retained as an attachment or export file so sanitization cannot destroy recoverable data.

### 5. Verify diagrams separately from ordinary prose

Semantic verification adds diagram identities, kinds, source hashes, artifact references, and native macro/directive identities. It does not require pixel equality. A verified native construct or a verified source artifact plus safe representation is complete; an absent/mismatched artifact is partial or failed according to body availability.

Diagram counts and outcomes flow through the existing single issue/notice collectors. No warning is generated merely because a diagram used a complete adaptation.

### 6. Resume downloads with stable partial files and continuity proof

The final cache path remains immutable and trusted only after complete size/hash verification. Downloads use a stable sibling `.part` plus a small atomic `.part.json` checkpoint with byte count, ETag/Last-Modified when supplied, source identity, and update time.

On retry, the client sends `Range: bytes=<size>-` and `If-Range` when a validator exists:

- matching `206` and `Content-Range` appends;
- `200`, validator drift, or incompatible range truncates and restarts once from byte zero;
- `416` accepts the partial only when the declared complete length matches and final verification succeeds, otherwise restarts;
- retryable stream failures retain the partial; cancellation retains it for the next run;
- non-retryable malformed responses remove only the invalid partial, never a verified cache file.

Hashing reads any retained prefix once and streams new bytes, keeping heap usage independent of resource size. Confluence uploads continue to stream and use existing upload reconciliation. A `413` becomes a typed non-retryable destination-limit degradation with actual size and administrator guidance; the source cache remains reusable.

Alternative considered: split rejected files automatically. Rejected for now because neither provider exposes a portable reassembly contract and silently replacing one attachment with parts changes its semantics. The preserved source link and cached verified bytes avoid data loss while accurately reporting the limitation.

## Risks / Trade-offs

- **[SVG preview differs from the editor canvas]** → Treat appearance as an adaptation, retain the original embedded model, and verify data rather than pixels.
- **[Provider accepts SVG upload but does not render it inline]** → Keep a native attachment link and source label; verification requires accessibility, not inline preview support.
- **[Large base64 decode consumes CPU]** → Use fixed chunks, a linear scanner without whole-payload substring copies, cooperative inventory boundaries, and never pass the token to Diplodoc.
- **[Source content changes between inventory and materialization]** → Recompute hash/size from the owning page and reject the resource if it no longer matches its descriptor.
- **[Range responses are inconsistent across gateways]** → Append only after strict status/range/validator checks; otherwise truncate and restart.
- **[Partial files accumulate]** → Stable names allow reuse and normal `ywtc clean` removes the containing runtime state/cache; partials are never packaged or reported as complete.

## Migration Plan

1. Add fixtures and failing unit/contract tests for extraction, rendering, verification, interruption, valid range resume, and invalid range restart.
2. Add the diagram model/scanner and synthetic-resource materialization, then wire all renderers and reports.
3. Replace random disposable Yandex partials with stable validated checkpoints.
4. Update README supported-content and limitation tables, build/package smoke checks, and archive the OpenSpec change.
5. Existing state remains valid. On the next ordinary run, source inventory fingerprints change for pages whose previously hidden diagrams are now represented; mapped destination pages are updated authoritatively without duplication.

Rollback consists of reverting the release. Existing destination attachments/pages remain untouched; newer source-inventory checkpoints can be invalidated and rebuilt because they are runtime cache, not user data.

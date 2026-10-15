# Design

## Context

See `proposal.md`. The remote pipeline currently creates a minimal placeholder body in its hierarchy pass and performs resource upload, rendering, final update, and verification inside one page-level `try`. A resource exception therefore skips the body update and leaves the placeholder visible. Destination fingerprints include version metadata, while verification currently checks only that content length is nonzero. Reports are written as local bundles but the CLI exposes only a raw path.

## Goals / Non-Goals

**Goals:**

- Make a source-derived body the first persisted body of every new remote page.
- Preserve readable page content through isolated resource, snapshot, render-refinement, and opener failures.
- Repair only exact tool-owned placeholders while retaining destination conflict protection.
- Verify the actual destination representation rather than accepting arbitrary nonempty content.
- Offer safe, testable, cross-platform report discovery and opening.

**Non-Goals:**

- No destination deletion, rollback deletion, implicit adoption of unrelated pages, or weakening of conflict checks.
- No guarantee that an authenticated source fallback URL is anonymously accessible.
- No state identity or serialized state-shape migration.
- No automatic browser opening unless explicitly requested.

## Decisions

### Render a complete bootstrap body before destination mutation

Inventory will cache every selected page and normalized document, then render a bootstrap body for every page before the structure pass. Bootstrap rendering uses source page URLs and typed source-resource fallbacks because destination IDs and uploaded resources do not yet exist. A renderer failure falls back to an escaped, destination-safe view of the complete raw body and records degradation. This is preferred over deletion rollback because deletion is prohibited and cannot reliably restore user-visible state.

### Distinguish uploaded resources from source fallbacks

Render context resource bindings will be a discriminated union. `uploaded` bindings may render native destination attachments; `source` bindings render absolute source links or visible unavailable-resource labels and warnings. YFM and Confluence Storage renderers will apply the same rule, including Confluence `ri:attachment` and YFM relative attachment references. This prevents a failed upload from producing a broken native reference.

### Isolate resource and snapshot failures

Each resource operation will catch and checkpoint its own failure, continue remaining resources, and contribute warnings/errors to the page result. Final rendering always runs with successful uploads plus fallback bindings. Raw snapshot upload is independently checkpointed. A verified full body with any fallback is `partial`; inability to establish and verify a source-derived body is `failed`.

### Repair exact generated placeholders only

Destination adapters will expose a body-only fingerprint and body classification derived from the fetched content without persisting raw destination bodies to state or reports. A saved mapping whose current title is expected and whose body fingerprint equals the historical placeholder generated for the same source may bypass the ordinary mismatch conflict solely to receive its bootstrap body. All other fingerprint mismatches remain conflicts.

### Verify a provider-normalized semantic digest

After create/update, the adapter re-reads the page body. Verification rejects empty and generated-placeholder classifications, then compares a semantic digest of the expected and actual destination bodies. The digest normalizes provider syntax into stable text, structural element, link, image, table, and code representations so harmless API serialization differences do not fail verification. Representation coverage and resource verification remain separate checks. Actual fetched content supplies the report preview.

Exact byte comparison was rejected because Confluence can normalize Storage Format. Length-only verification was rejected because it accepts placeholders and truncation.

### Keep state structure stable

Existing page and resource statuses are sufficient. The existing intermediate status remains serializable, but UI language changes from “skeleton” to “bootstrap/content staged.” Failed resources retain their own error and retry on the next run. Destination fingerprint checkpoints continue to protect manual edits.

### Add a dedicated report catalog

A report catalog reads only direct child directories of the selected workspace report root, parses strict report JSON, requires the sibling HTML file, and sorts valid entries by finished/start time. Explicit IDs accept only canonical run-directory names and resolved paths must remain inside the report root. URL generation uses Node's `pathToFileURL`; opening uses the ESM `open` package behind an injected function for tests.

Migration results and typed run errors carry report paths so normal, partial, and report-producing failure paths can print a URL. `--open-report` invokes the catalog opener after report persistence and treats opener failure as an output warning, never as a migration failure.

### Generate the shortest reliable wizard handoff

The wizard uses full URL placeholders so unique profile matching works without profile flags. It omits the default scope. The default `~/.ywtc` workspace needs no flag; a non-default selected workspace includes `--workdir` because a later shell location cannot be assumed.

## Risks / Trade-offs

- [Source fallback requires authentication] → Keep the original reference visible, report it, and retry native transfer on rerun.
- [Provider normalization causes false verification differences] → Compare semantic digests and retain focused fixtures for both provider formats.
- [A legacy placeholder was manually retained intentionally] → Repair only exact generated content with the expected mapped title and source-specific URL.
- [Bootstrap creation adds rendering work] → Reuse cached normalized documents and rendered bootstrap bodies; no extra source API reads are required.
- [Malformed report bundles obscure latest selection] → Skip them with explicit warnings and never traverse outside the report root.

## Migration Plan

1. Ship the additive CLI and pipeline behavior in `3.2.0` without changing state identity or stored structure.
2. Existing mapped placeholders are repaired by an ordinary rerun; no separate migration command is needed.
3. Rollback is code-only. Existing source-derived pages, state, resources, and reports remain untouched because the change performs no deletion.

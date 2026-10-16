# Proposal

## Why

Page content can currently be transferred without the discussion that explains decisions and unresolved work. ywtc needs a provider-neutral, resumable comment archive that preserves readable discussion context without impersonating source authors or risking page transfer completion.

## What Changes

- Read page footer and inline comment forests from Yandex Wiki and Confluence, including authors, dates, statuses, inline context, deleted tombstones, and nested replies.
- Enable comment transfer by default and add `--comments` / `--no-comments` to `migrate` and `doctor` without changing automatic state identity.
- Render one archive comment per destination page using native collapsible sections where available, with safe quote or code fallbacks.
- Collect page attachments explicitly referenced by comments into one deterministic hash-addressed ZIP, upload or export it, and verify the archive reference.
- Persist comment fingerprints, destination mappings, history, counts, failures, conflicts, and stale status so reruns are idempotent and recoverable.
- Extend Markdown/HTML exports, progress, state, HTML/JSON reports, CLI help, and README documentation with exact comment inventory and outcomes.
- Treat comment failures as page/run `partial` while allowing the main page body and resources to complete.
- Do not transfer reactions, attachment-level comments, blog/custom-content comments, or delete any source or destination comment or attachment.

## Capabilities

### New Capabilities

- `comment-archives`: Provider-neutral discovery, representation, attachment packaging, rendering, verification, conflict handling, and resumable archival of page comments.

### Modified Capabilities

- `wiki-migration`: Add comment options, capabilities, inventory, state, lifecycle, progress, and reconciled report accounting to remote transfers.
- `static-export`: Include readable comment sections and deterministic attachment archives in Markdown/HTML exports and manifests.
- `project-maintenance`: Document supported comment behavior and limitations and verify the packaged CLI contract.

## Impact

The change affects CLI parsing, doctor/preflight, provider clients and adapters, the normalized domain model, migration orchestration, cache/state, streamed ZIP generation, filesystem renderers, verification, progress/reporting, tests, OpenSpec, and README. It adds no destructive operation and stores no source credentials or undisclosed identity data beyond fields returned by the configured APIs.

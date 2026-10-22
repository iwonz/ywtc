# Design

## Context

See `proposal.md` for motivation. The current normalized model treats YFM mention-like tokens as plain text and reduces Confluence `ri:user` links to generic links. In particular, `@{username}` can be altered by the YFM processor. Configuration is strict and global, renderers share one provider-neutral document, migration state/report totals are derived centrally, and retry normally ignores complete pages.

## Goals / Non-Goals

**Goals:**

- Preserve every recognized mention through normalization and read-back verification.
- Give operators one explicit policy that produces deterministic text/links or conservative native identities.
- Keep lookup bounded, deduplicated, rate-limited, redacted, and retryable.
- Keep status semantics information-based: a verified fallback is complete even when native identity was unresolved.

**Non-Goals:**

- Guarantee that a provider sends an actual notification.
- Search or provision users outside documented destination APIs.
- Treat display-name similarity as identity proof.
- Emit native mentions from historical comment archives or static exports.
- Change state identity, linked-scope traversal, or CLI options.

## Decisions

### Strict global discriminated policy

`AppConfig` receives a normalized `MentionPolicy` with `mode: off | template | auto`. `off` has no active lookup fields; template/auto share validated `textTemplate`, optional `urlTemplate`, and aliases keyed by `username:`, `accountId:`, `userKey:`, or `id:`. Supported placeholders are parsed at configuration load. This keeps mistakes ahead of network access and avoids destination-specific policy branches. A per-route policy was rejected because the operator selected one workspace-wide rule.

### Typed inline tokens before generic transformation

YFM is scanned once with a small state machine that tracks escapes, inline/fenced code, HTML tags, URLs/emails, and protected diagram ranges. Each mention is replaced with a collision-resistant marker before Diplodoc and restored as a `NormalizedNode` of type `mention`. Confluence Storage Format is parsed structurally and `ri:user` becomes the same node. This follows the existing diagram/template protection pattern and avoids catastrophic regular expressions over large inline payloads.

### Presentation is separated from identity resolution

`MentionIdentity` stores source token and available identity fields. `MentionPresentation` stores outcome, escaped label, optional safe URL, optional verified destination user, reason, and retryability. A pure template service handles placeholders and safe URLs. A destination resolver handles provider lookup; renderers only consume the presentation. This makes Markdown/HTML and comment archives deterministic without pretending they support native users.

### Native identity requires unique provider evidence

Resolution order is explicit alias, immutable ID, then exact username/user key/email. Display name is presentation-only. Data Center uses the user endpoint and renders `ri:username` or `ri:userkey`; Cloud resolves account IDs and renders `ri:account-id`. Yandex only marks identities proven by its available API as resolved. Unsupported, missing, ambiguous, forbidden, and transient failures all use the fallback; only transient provider failures are retryable.

### Comments never produce native mentions

Comment bodies are parsed with the same source rules but always use safe template presentation before the archive is rendered. This prevents a historical archive from notifying all referenced users. Comment mention occurrences remain a separate metric and are verified in the archive text/link representation.

### Complete fallback and targeted retry coexist

A page with a verified fallback stays `complete`; unresolved native identity adds a typed warning, not a degradation. Missing representation or failed semantic read-back is a degradation and makes the page incomplete. Retry planning gains an exception for `complete` pages with a retryable mention-resolution issue and rerenders only the owning page while carrying forward verified resources/comments.

### Policy changes invalidate rendering, not state identity

A stable hash of mode, templates, and aliases is included in each page's source/render fingerprint and state mention record. The canonical state ID remains unchanged. Ordinary rerun reconciles pages when policy changes; retry handles only typed transient outcomes from the latest lineage.

### Central outcome accounting

Each occurrence has exactly one outcome: `preserved`, `native`, `linked`, `text`, `unresolved`, or `failed`. Aggregates are calculated once for terminal output, state, report JSON, and Mantine UI. Reports store source tokens and non-secret destination identifiers but redact email fields and never persist credentials. Zero-value UI counters remain hidden.

## Risks / Trade-offs

- **Provider search can be expensive** → Deduplicate by unique normalized identity, prefer Cloud bulk lookup, and run through existing read concurrency/rate buckets.
- **Yandex cannot verify arbitrary users through the documented Wiki endpoint** → Use a fallback and explain the unresolved limitation rather than creating a possibly wrong native mention.
- **Native markup may or may not notify** → Verify only stored native identity; document that delivery depends on provider policy.
- **Plain `@word` can be ordinary prose** → Apply boundary/context rules and preserve the exact token in `off`; never expand scope from a mention.
- **Aliases can expose personal identifiers in local artifacts** → Redact hidden email and secrets; report only fields needed to diagnose the local transfer.
- **New state fields meet existing state** → Make mention fields optional on read and write current fields on the next affected run; perform no format conversion or deletion.

## Migration Plan

1. Add optional runtime/config/state/report fields with `off` as the normalized default.
2. Add parsing and template rendering behind the default-off policy so existing transfers preserve current visible behavior while fixing braced-token loss.
3. Add destination resolvers and auto rendering, then wire inventory, verification, retry, progress, and report UI.
4. Archive the OpenSpec change, publish through Release Please, and retain rollback by selecting `mentions.mode: off`; no destination objects or state files are deleted.

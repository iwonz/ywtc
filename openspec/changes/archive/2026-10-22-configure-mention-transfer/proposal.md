# Proposal

## Why

Mentions currently pass through provider-specific content as untyped text or markup, so braced YFM mentions can be damaged during normalization and cross-provider transfers cannot deliberately preserve, link, or resolve users. Operators need one safe workspace policy that defaults to no conversion, supports deterministic templates, and only emits native destination mentions when identity is proven.

## What Changes

- Add a strict global `mentions` policy with `off`, `template`, and `auto` modes, safe text/link templates, and optional identity aliases.
- Normalize Yandex Wiki and Confluence mentions into provider-neutral nodes and render them as preserved text, safe links, or verified native destination mentions.
- Resolve destination users conservatively through provider capabilities; ambiguous, unavailable, or missing identities retain a readable fallback and an actionable warning instead of silently targeting the wrong user.
- Keep archived comment mentions non-native to avoid notification storms while preserving their readable identity and optional profile link.
- Persist mention policy fingerprints and outcomes so ordinary reruns and targeted retry can reconcile changed policies or transient lookup failures without changing state identity.
- Add mention inventory, progress, state, terminal, JSON, and offline report accounting with zero-value suppression and secret/email redaction.
- Do not delete destination data, send explicit notification API calls, promise provider notification delivery, or expand linked scope through mentions.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `wiki-migration`: Define configurable mention parsing, resolution, rendering, verification, status, progress, and state behavior.
- `comment-archives`: Require safe non-native mention presentation inside archived comments.
- `static-export`: Define mention presentation for Markdown and HTML destinations.
- `targeted-run-retry`: Select transient unresolved mention work without rewriting unrelated complete content.
- `workspace-management`: Validate the global mention policy and generate an explicit disabled default.
- `project-maintenance`: Document and package the current mention configuration and report behavior.

## Impact

The change affects strict workspace configuration, normalized content types and renderers, Confluence/Yandex adapters and clients, migration/retry orchestration, state/report contracts, the Mantine report application, README examples, and package/browser/contract tests. It adds no CLI option and no new runtime dependency.

## Why

`ywtc` currently assumes a source checkout, a current-directory `.env`, and a Confluence Data Center-only API. A public `2.0.0` release needs predictable workspaces, explicit diagnostics, Cloud support, and verified npm, npx, Homebrew, and GitHub release channels without weakening resumability or credential safety.

## What Changes

- **BREAKING** Replace the implicit migration invocation with explicit `init`, `doctor`, `migrate`, and `update` commands plus `--version`.
- Introduce deterministic workdir resolution, idempotent initialization, workdir-local configuration, and `.states` runtime storage.
- **BREAKING** Require an explicit supported Confluence deployment/authentication pair: Data Center with PAT or Cloud with email/API token.
- Split Confluence access into Data Center and Cloud adapters behind one normalized migration interface, with capability-based preflight and no artificial Data Center upper-version limit.
- Validate tolerant Yandex Wiki Public API v1 response contracts and retain OAuth/IAM plus both organization headers.
- Publish the public scoped package `@iwonz/ywtc` with working global, npx, and Homebrew installation paths and a safe update checker/installer.
- Expand release automation to validate Conventional Commits, publish npm with OIDC provenance, attach verified archives, maintain the same-repository Homebrew formula, and include all meaningful commit types in release notes without changing the product SemVer rules.
- Require agents to synchronize a clean `master` with `origin/master` before implementation and again before commit/push.
- Replace the README header and rewrite operator/developer documentation for v2 installation, compatibility, workdirs, commands, state, credentials, and releases.
- Preserve non-destructive migration, resumable state, dry-run guarantees, secret redaction, and current Data Center state identity.
- Do not add Confluence Server, Basic Auth, Cloud OAuth app flow, history/comments/users/permissions/watchers migration, destination deletion, or automatic adoption of unrelated destination content.

## Capabilities

### New Capabilities

- `workspace-management`: Workdir selection, initialization, configuration loading, diagnostics, and safe update behavior.

### Modified Capabilities

- `wiki-migration`: Confluence Cloud/Data Center adapters, capability preflight, Yandex response validation, deployment-aware state, and workdir-scoped runtime behavior.
- `project-maintenance`: Public package identity, v2 documentation, agent synchronization, CLI contract, and expanded validation coverage.
- `release-management`: npm trusted publication, complete release notes, package validation, GitHub assets, and same-repository Homebrew delivery.

## Impact

- Affects CLI parsing and dispatch, configuration loading, state/report paths, API clients, migration preflight, package metadata, tests, README, image assets, GitHub Actions, Release Please, and contributor instructions.
- Adds public package and commit-message tooling plus release-time npm/Homebrew network dependencies.
- Requires a one-time interactive npm bootstrap by owner `iwonz`, followed by repository-bound trusted publishing configuration; no long-lived npm token is stored.
- The release commit intentionally targets SemVer `2.0.0`; existing v1 direct CLI invocation is removed.

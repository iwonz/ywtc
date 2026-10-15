# Design

## Context

See `proposal.md` for motivation. Workspace discovery currently depends on a JSON marker; YAML points at secrets in `.env`; process variables can override runtime defaults; and state, report, and export JSON carry independent schema markers. The transfer pipeline relies on canonical identities, atomic state saves, conflict fingerprints, redaction, transactional export replacement, and release hygiene, all of which must remain intact.

## Goals / Non-Goals

**Goals:**

- Make one ignored YAML file the complete ywtc configuration and workspace signal.
- Keep initialization idempotent, diagnostics actionable, and secrets redacted.
- Accept exactly one unversioned current runtime structure for state and export ownership.
- Preserve retry, resume, conflict, cancellation, degradation, and non-destructive guarantees.

**Non-Goals:**

- Reading or converting marker, `.env`, environment-indirected credentials, or older runtime structures.
- Deleting stale local runtime files or changing existing remote content outside mapped operations.
- Removing npm SemVer or external product/API version reporting.

## Decisions

### Resolve initialization and operational workdirs separately

`init` resolves explicit `--workdir` relative to CWD or defaults to `~/.ywtc`. Operational commands first honor explicit `--workdir`, otherwise use CWD only when `CWD/ywtc.config.yaml` exists, then fall back to `~/.ywtc`. No ancestor traversal or marker read occurs. This prevents an existing project config from redirecting a default `init` while keeping local project workspaces convenient.

### Parse one strict YAML model with direct secrets

Zod strict objects validate the root, defaults, profiles, organization, and limits. Profiles contain direct `token`; Confluence Cloud also contains direct `email`. Parsing normalizes URLs and applies in-schema defaults, but does not inspect process environment. Blank template credentials remain syntactically loadable so `init` is useful; operation-specific validation rejects blank selected credentials before API access and reports YAML field paths. `doctor` without endpoints validates every configured profile.

### Use unversioned current runtime contracts

State removes `version`, reports remove `version`, and export manifests remove `schemaVersion`. State identity hashing serializes only normalized source and destination identities, including profiles and filesystem format where applicable. Strict current state validation rejects missing and unknown fields before mutation. Export adoption requires an exact current manifest, `tool: ywtc`, and matching identity. No parser recognizes or names earlier structures.

State checkpoints remain atomic after every successful mutation. `--fresh` retains an existing selected file as a backup for live runs and uses empty in-memory state for dry runs. Destination fingerprints still turn external edits into conflicts. SIGINT/SIGTERM still stop new scheduling and flush current state/report data.

### Preserve safety without compatibility code

Unrecognized state and manifests are never overwritten, converted, or deleted. Errors identify the affected path and current safe actions such as selecting another state, using `--fresh`, or choosing an empty export directory, without version-specific language. Content fallbacks, raw snapshots, attachment streaming, retries, and post-write verification are unchanged.

### Keep packaging and documentation current-only

Remove `dotenv`, `.env.example`, marker/env templates, and package references. Keep `ywtc.config.example.yaml` with empty direct secrets and example domains. Runtime `ywtc.config.yaml`, `.states/`, cache, reports, and exports remain ignored and excluded from npm. Release checks scan active source/specs/docs for retired schema keys and scan publishable artifacts for populated secrets. Archived OpenSpec history remains untouched.

## Risks / Trade-offs

- **Direct secrets make the YAML file sensitive** → create new configs as `0600`, ignore runtime configs, redact loaded values everywhere, and reject populated publishable examples.
- **Removing schema markers makes evolution explicit through releases rather than files** → enforce one strict structure and treat any mismatch as invalid instead of guessing.
- **Automatic state IDs change when the schema namespace is removed** → preserve old files untouched; the current canonical pair deterministically selects the new ID.
- **Strict unknown-key rejection can expose typos that were previously ignored** → report exact YAML/JSON paths before API or destination mutation.
- **Existing export directories are not automatically adopted** → require the exact current ownership manifest and preserve anything else unchanged.

## Release Plan

Implement and validate the complete current contract, archive this OpenSpec change, and commit it as a breaking feature. Release Please calculates `3.0.0`; the existing trusted workflow publishes GitHub/npm artifacts and then verifies and updates Homebrew. Release notes state the current behavior without a migration procedure. Rollback is a normal source revert followed by a new SemVer release; published versions and user runtime files are never rewritten.

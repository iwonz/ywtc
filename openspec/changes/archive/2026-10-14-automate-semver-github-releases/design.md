## Context

The repository currently contains one `1.0.0` root commit, no tags, no GitHub Releases, and no workflow files. Product changes already use an audited OpenSpec lifecycle and a comprehensive `npm run check`; release automation must consume those completed changes rather than bypass their checks. The package is private to npm but intentionally packable as a GitHub artifact.

Release Please is selected because its v4 GitHub Action derives versions and release notes from Conventional Commits, maintains a reviewable release pull request, and creates GitHub tags/releases through the repository token. The documented action outputs also support attaching artifacts immediately after release creation.

## Goals / Non-Goals

**Goals:**

- Apply stable SemVer consistently and make each version reviewable before publication.
- Publish GitHub Releases with installable archives and checksums only after all project checks pass.
- Preserve the mandatory OpenSpec lifecycle for product, documentation, and tooling changes.
- Bootstrap the existing `1.0.0` state exactly once without generating an artificial `1.1.0` from old history.
- Keep CI credentials least-privileged and independent of migration secrets.

**Non-Goals:**

- Publishing to npm, Homebrew, Docker, or another registry.
- Automatically merging release pull requests.
- Signing artifacts or producing platform-specific executables in this change.
- Changing runtime migration, retry, resume, conflict, or content-degradation behavior.

## Decisions

### 1. Release Please owns future version proposals

`release-please-config.json` defines one root Node package, `v`-prefixed tags, `CHANGELOG.md`, and a bootstrap boundary at the last pre-automation commit. `.release-please-manifest.json` records `1.0.0`. Release Please updates version metadata only in its release PR; a human still decides when to merge it.

Conventional Commit mapping is explicit: `feat` produces minor, `fix`/`perf`/`revert` produce patch, and `!` or `BREAKING CHANGE` produces major. Documentation, tests, build, CI, and chores do not release by themselves. This is preferred to manual version selection because it makes the version derivable from history.

### 2. One workflow separates untrusted checks from trusted publication

`.github/workflows/release.yml` runs the same check job for pull requests, `master`, tags, and manual diagnostics with only `contents: read`. Trusted jobs depend on it:

- a `master` job runs Release Please with `contents`, `issues`, and `pull-requests` write permissions;
- a tag job validates and publishes manually pushed SemVer tags with only `contents: write`.

Release Please-created releases attach their artifacts in the same job because events emitted by the default `GITHUB_TOKEN` do not reliably trigger another workflow. The manual tag job supplies the one-time `v1.0.0` bootstrap and a recoverable publication path.

### 3. Repository metadata and tags must agree

`scripts/validate-release-tag.mjs` implements strict SemVer 2.0 parsing and precedence without adding a runtime dependency. It verifies tag syntax, exact package and lockfile versions, manifest version, a dated changelog heading, and monotonic ordering against prior release tags. Unit tests cover stable versions, prereleases, invalid leading zeros, build metadata, ordering, and metadata mismatches.

Release Please remains the normal stable-release path. The tag publisher treats a valid `-prerelease` version as a GitHub prerelease and rejects build-metadata variants that do not increase SemVer precedence.

### 4. GitHub is the distribution channel

Each release attaches `ywtc-<version>.tgz` from `npm pack` and a SHA-256 file. GitHub also supplies source archives. `package.json` remains `private: true`, and no npm token or `npm publish` step is introduced.

### 5. OpenSpec and release metadata remain distinct

Every substantive repository change still completes and archives an OpenSpec change before commit. Release Please may then generate a release PR limited to version fields, changelog, and manifest for those already-audited commits. Agents use Conventional Commit messages so release calculation is deterministic; they do not mix new product changes into the generated release PR.

## Risks / Trade-offs

- [Risk] Repository Actions settings can prevent `GITHUB_TOKEN` from opening pull requests. → Document the one-time **Read and write permissions** and **Allow GitHub Actions to create and approve pull requests** settings.
- [Risk] Release creation can succeed before artifact upload fails. → Keep the workflow failed and make artifact upload idempotent with `--clobber`; rerunning repairs the same release.
- [Risk] A manual tag could bypass the release PR. → Validate complete metadata, version ordering, and quality gates before publication; document it as bootstrap/recovery only.
- [Risk] A wrong Conventional Commit type produces the wrong bump. → Document the mapping and require human review of the Release Please PR.
- [Risk] `GITHUB_TOKEN`-created pull requests may not trigger other workflows. → Run the full quality gate on `master` before invoking Release Please and again on the merged release revision.

## Migration Plan

1. Add workflow, release configuration, baseline changelog, validator, tests, and documentation.
2. Run local validation, archive this OpenSpec change, commit with a non-release-producing `ci` type, and push `master`.
3. Confirm the workflow succeeds and Release Please does not reinterpret pre-bootstrap commits.
4. Create annotated tag `v1.0.0` on the release-enabled commit and push it.
5. Confirm GitHub Release `v1.0.0`, archive, checksum, and workflow status.
6. Future product commits accumulate in a Release Please PR; merging that PR publishes the next release.

Rollback removes or disables the workflow before any new tag. Published releases and tags are never deleted automatically; incorrect publication requires an explicit maintainer decision.

## Open Questions

None.

# Design

## Context

See `proposal.md` for motivation. Release Please has already created immutable tag `v2.0.0` and its GitHub Release, but publication stopped before packing because the tagged validator rejects Release Please's linked, parenthesized changelog heading. A workflow rerun uses the original workflow snapshot, while a manual dispatch uses the current trusted workflow but checks out the requested tag.

## Goals / Non-Goals

**Goals:**

- Validate both Release Please's generated heading and the repository's legacy dated heading without accepting an undated or wrong-version entry.
- Recover `v2.0.0` without moving its tag or changing its package source.
- Keep recovery idempotent when npm, assets, notes, or the formula were partially completed.

**Non-Goals:**

- Rewriting release history or changing Release Please's changelog format.
- Bypassing the tagged revision's full quality gate.
- Adding npm tokens, weakening OIDC provenance, or automatically retrying arbitrary failed tags.

## Decisions

### Match explicit changelog heading grammars

The validator will accept only a line whose version matches the tag and whose date is ISO `YYYY-MM-DD`. Supported shapes are the Release Please linked heading (`## [version](url) (date)`) and the existing legacy heading (`## [version] - date`). The URL is treated as Markdown link content on the same line and cannot replace the required date.

This is preferred to normalizing the generated changelog after Release Please because generated metadata should remain reviewable and unmodified. It is also preferred to checking for the version anywhere in the file because that could silently accept stale or undated entries.

### Normalize npm pack result formats

Package verification and workflow artifact selection will accept both the npm 11 JSON array and npm 12 object keyed by package name. They will still require exactly one usable result with a non-empty filename and files list where applicable. This keeps the release pipeline compatible with the declared npm floor and current npm without pinning regular publication to an older CLI.

### Separate recovery tooling from tagged package source

On `workflow_dispatch`, the workflow will fetch `origin/master` after checking out the requested tag and extract the current validator plus package verifier from one commit. The validator runs from a temporary runner directory with the tagged checkout as its working directory. The verifier temporarily replaces only the tag's non-published smoke-test script during the full quality gate, after which Git restores the tagged file before pack. Automatic release runs continue using tooling bundled in their tag.

The tag remains the sole source for dependencies, quality checks, package contents, archive, checksum, and publication. Only the release-control validator comes from trusted current `master`, which allows repair of a validator defect embedded in an immutable tag.

This is preferred to moving the tag, deleting/recreating the GitHub Release, publishing manually, or embedding duplicate validation logic in YAML.

### Keep recovery explicit and idempotent

Recovery continues to require a manually supplied existing `vX.Y.Z` tag. The workflow checks npm before publishing, uses `--clobber` only for release artifacts, adds installation notes only when absent, and regenerates the formula from the registry tarball. It never overwrites an npm version.

## Risks / Trade-offs

- **Current `master` could contain faulty recovery tooling** → Recovery is authorized manually, runs only repository-reviewed code, validates all synchronized metadata, and still executes the tagged revision's complete quality gate.
- **Fetching `master` could race with a concurrent push** → Fetch one snapshot and extract both validator files plus the package verifier from that same commit.
- **Temporary verifier replacement could alter package contents** → The verifier is not publishable, Git restores it before packing, and the archive is created only after restoration.
- **A permissive Markdown URL match could accept malformed links** → Anchor the entire heading line, require non-empty inline link content, matching version, and an ISO-shaped date; regression tests cover near misses.
- **Partial publication may already exist** → Existing idempotent checks repair missing channels without duplicate npm publication or tag mutation.

## Migration Plan

1. Merge the validated correction to `master` without creating a product release from the maintenance-only change.
2. Dispatch `release.yml` with `release_tag=v2.0.0`.
3. Verify npm provenance/version, GitHub assets and notes, Homebrew formula commit, and clean installs through npm, npx, and Homebrew.
4. If recovery fails before npm publication, fix forward and dispatch the same tag again. If npm succeeds but a downstream channel fails, rerun the same idempotent recovery.

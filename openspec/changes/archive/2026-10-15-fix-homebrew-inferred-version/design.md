## Context

Homebrew identifies stable formula versions from artifact URLs when possible. The npm registry tarball URL already ends in `ywtc-X.Y.Z.tgz`, so the generated explicit `version` stanza repeats information Homebrew can infer. Current strict audit rejects that duplication and blocks formula publication after npm and GitHub have already succeeded.

## Goals / Non-Goals

**Goals:**

- Generate a formula accepted by current strict Homebrew audit.
- Keep the requested SemVer validated before formula generation.
- Preserve installation, formula test, and CLI version verification.

**Non-Goals:**

- Changing release version selection or npm artifact identity.
- Adding dependencies or changing public CLI behavior.
- Modifying retry, resume, conflicts, content degradation, or user data handling.

## Decisions

### Use Homebrew's URL-derived stable version

The generator will omit the Ruby `version` stanza. The registry URL remains the version source and the formula test continues comparing Homebrew's inferred `version` to `ywtc --version`. Keeping an explicit version was rejected because strict audit identifies it as redundant. Disabling strict audit was rejected because it would weaken the release gate.

### Retain the version input validation

The generator still receives and validates the release SemVer used to request the npm tarball. This keeps invalid release context failures early and preserves the generator's existing public contract, while the formula itself avoids duplicated metadata.

The release recovery path remains idempotent: npm is not republished when the version exists, GitHub assets are refreshed, and formula verification can be retried independently. Product-level resume, conflict, and degradation guarantees are unaffected.

## Risks / Trade-offs

- **[A future registry URL stops exposing SemVer]** → Strict audit and the formula's installed CLI version assertion fail before publication.
- **[The requested version and downloaded URL diverge]** → The workflow obtains the URL directly from `npm view @iwonz/ywtc@X.Y.Z`, and the formula test checks the installed CLI against Homebrew's inferred version.
- **[Older Homebrew behaves differently]** → The supported release gate targets current Homebrew while the formula uses its long-standing URL inference contract.

## Migration Plan

1. Remove the generated explicit version stanza and update unit expectations.
2. Run the full quality gate and archive this change.
3. Retry the idempotent `v2.0.0` recovery workflow so Homebrew verifies and publishes the formula.

Rollback consists of reverting the generator change; npm and GitHub release artifacts are unchanged.

## Open Questions

None.

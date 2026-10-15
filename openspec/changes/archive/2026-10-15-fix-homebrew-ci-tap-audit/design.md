## Context

The release workflow generates `Formula/ywtc.rb` from the exact npm registry tarball and verifies it on an ephemeral macOS runner before committing it to `master`. The generated formula now passes `brew style`, but current Homebrew rejects `brew audit` when its argument is a filesystem path. Homebrew expects audit, install, and test operations to resolve a formula through a tap.

The release contract already requires strict audit, a real installation, and a functional CLI test. This change must restore those checks without weakening them, changing the formula generator, or mutating a developer workstation.

## Goals / Non-Goals

**Goals:**

- Verify the generated candidate through a supported Homebrew tap lookup.
- Keep the tap and installation isolated to the disposable GitHub Actions runner.
- Preserve strict audit, installation, formula test, and CLI version verification.
- Lock the supported invocation into an automated workflow regression test.

**Non-Goals:**

- Changing the published formula content or package artifact.
- Adding retry, resume, conflict, or degradation behavior to the product transfer pipeline.
- Persisting a CI-only tap or modifying a contributor's local Homebrew setup.
- Relaxing Homebrew style or audit policy.

## Decisions

### Stage the candidate in a non-git temporary tap

The workflow will create `iwonz/ywtc-ci` with `brew tap-new --no-git`, resolve its directory with `brew --repository`, and copy the generated formula into its `Formula` directory. It will then address the candidate as `iwonz/ywtc-ci/ywtc` for audit, install, and test.

This matches Homebrew's supported named-formula workflow while ensuring the exact generated file is tested. A committed test tap was rejected because it would add repository state before verification. Auditing only the eventual public tap was rejected because it could validate an older formula instead of the candidate.

### Keep style verification on the generated repository file

`brew style Formula/ywtc.rb` remains before tap staging. This preserves a direct check of the generated output and produces errors against the repository path developers recognize.

### Rely on runner disposal for cleanup

The temporary tap and installed candidate exist only on the fresh GitHub-hosted runner. Explicit cleanup is unnecessary and could hide the primary verification error if cleanup also fails. No retry is added: a Homebrew infrastructure failure leaves the release recoverable through the existing idempotent manual workflow dispatch.

Product resume, destination conflicts, and content-degradation behavior are unaffected because this change operates only after the immutable npm package has been built and published.

## Risks / Trade-offs

- **[Homebrew changes temporary tap behavior]** → Keep the commands covered by a workflow regression test and exercised in every publication.
- **[A fixed tap name already exists]** → GitHub-hosted macOS runners are fresh; a collision fails closed before audit or installation.
- **[The copied candidate differs from the generated file]** → Use a direct file copy after style validation and perform every subsequent check on the fully qualified formula from that tap.
- **[A transient Homebrew failure interrupts publication]** → The release workflow remains idempotent and can be manually rerun for the existing tag without republishing npm.

## Migration Plan

1. Update the Homebrew verification step and regression test.
2. Run focused workflow tests and the complete project quality gate.
3. Rerun release recovery for `v2.0.0`; npm and GitHub artifact steps remain idempotent.
4. Let the successful Homebrew job commit the verified formula to `master`.

Rollback consists of reverting the workflow commit. Published npm and GitHub artifacts are immutable and require no rollback.

## Open Questions

None.

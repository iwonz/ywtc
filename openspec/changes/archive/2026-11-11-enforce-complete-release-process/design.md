# Design

## Context

See `proposal.md` for motivation. Release Please already separates audited source commits from its four-file metadata pull request. The `6f7731a` push passed the complete source gate and correctly opened PR `#44` for `5.4.7`; package metadata, GitHub Releases, npm, and Homebrew remained at `5.4.6` because that release PR was not merged. Existing publication jobs validate their own stages but there is no final cross-channel assertion or contributor rule that prevents stopping after the source push.

## Goals / Non-Goals

**Goals:**

- Bind release completion to one exact tag/version across all supported distribution channels.
- Make the final workflow status prove externally observable publication, not only successful write steps.
- Give maintainers and agents an unambiguous terminal condition for release requests.
- Keep recovery idempotent and use the same final proof as automatic publication.

**Non-Goals:**

- No direct release from an ordinary source push and no automatic bypass of Release Please review.
- No manual tag creation, tag movement, duplicate npm publication, formula mutation, or stored publication token.
- No change to migration runtime behavior, object outcomes, transformation quality, retryability, run status, or CLI exit codes.

## Decisions

### Validate a single release snapshot

Add a reusable verifier that accepts `vX.Y.Z`, loads local release metadata and formula state, reads the public GitHub Release and npm metadata, downloads the published npm tarball and GitHub checksum asset, and validates one snapshot. The pure validation boundary receives normalized evidence so unit tests cover mismatches without network calls.

The required evidence is:

- local package, lockfile root, Release Please manifest, and changelog identify `X.Y.Z`;
- GitHub Release is non-draft, identifies `vX.Y.Z`, contains installation notes, and exposes uploaded `iwonz-ywtc-X.Y.Z.tgz` plus `.sha256` assets;
- npm exposes `@iwonz/ywtc@X.Y.Z` and its HTTPS tarball;
- the downloaded npm tarball SHA-256 matches the GitHub archive digest, checksum asset, and `Formula/ywtc.rb`; the formula URL equals the npm tarball URL.

Checking only workflow outputs was rejected because a write step can succeed before a channel is observable or can leave mismatched artifacts. Re-running installation in the final Linux job was rejected because the publication and Homebrew jobs already install and test the exact package; the final job proves channel agreement.

### Add a terminal workflow job

Add a read-only `release-complete` job after `publish-npm` and `homebrew`. It checks out current `master`, installs locked tooling, and runs `npm run release:verify -- vX.Y.Z` using the tag output from `publish-npm`. Normal source pushes skip it because no release was created. Any publication or formula failure already fails its owning job; a cross-channel mismatch fails the terminal job.

### Make release completion explicit in canonical guidance

README remains the operator source of truth: it will state the two phases and the exact completed channels. AGENTS will state that a requested release remains active through release-PR review/merge, workflow monitoring, and final channel verification. A source commit push or release-PR creation is only pending release state.

### Preserve recovery and identity boundaries

The verifier is read-only and safe to rerun. Manual `workflow_dispatch` recovery continues to repair an existing tag and then reaches the same final job. The exact tag is the identity boundary; evidence for another version is a hard failure. Existing npm handoff retry remains responsible for registry propagation, while a later verifier failure uses the documented recovery workflow rather than inventing a second mutation path. The verifier exits `0` only for complete agreement and nonzero with a channel-specific diagnostic otherwise.

## Risks / Trade-offs

- [External channel propagation is briefly delayed] → Run the verifier only after the existing bounded npm handoff and Homebrew job; retain workflow rerun recovery.
- [GitHub API rate limiting] → Use the workflow token for read-only GitHub requests and keep npm reads public.
- [Large tarball download adds time] → Download once in the final job; hashing the actual registry artifact is stronger than trusting metadata alone.
- [Formula commit races with another master update] → Keep the existing fast-forward guard; the final job checks out current `master` after Homebrew succeeds.
- [A source push is mistaken for a release again] → Enforce the terminal condition in AGENTS, README, tests, and the workflow job name/status.

## Migration Plan

1. Add failing unit and workflow/documentation contract tests.
2. Implement the verifier, command, terminal job, and guidance until tests pass.
3. Run the complete project gate, archive the OpenSpec change, and push the audited source commit.
4. Wait for Release Please PR `#44` to update, review its four allowed files and `5.4.7`, then merge it.
5. Monitor the release workflow through `release-complete`; verify GitHub Release/assets, npm, npx metadata, and Homebrew formula before reporting completion.

Rollback before release is a normal revert of the source change. After `5.4.7` publication, immutable npm/tag history is not rewritten; any verifier defect is corrected in a later audited release or the existing explicit recovery workflow.

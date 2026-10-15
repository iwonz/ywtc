# Design

## Context

See `proposal.md` for motivation. The release workflow publishes npm and GitHub artifacts on Ubuntu, then starts Homebrew verification on macOS. npm publication completion does not guarantee immediate read-after-write visibility from the registry endpoint used by the subsequent job. Manual workflow dispatch already provides a safe, idempotent recovery path.

## Goals / Non-Goals

**Goals:**

- Absorb normal npm registry propagation delays inside the automatic release run.
- Verify the exact requested version and a successfully downloaded tarball before calculating its checksum.
- Keep retry duration bounded, progress visible, and terminal guidance actionable.
- Preserve idempotent manual recovery and least-privilege permissions.

**Non-Goals:**

- Retrying failed npm publication or publishing a second copy of a version.
- Masking persistent registry, authorization, package metadata, or tarball integrity failures.
- Weakening Homebrew style, audit, install, or functional tests.

## Decisions

### Retry only the registry handoff

The Homebrew generation step will retry the combined operation of reading exact-version metadata and downloading the referenced tarball. Publication remains single-attempt and protected by its existing-version check. This keeps a transient consistency concern separate from mutation and makes reruns safe.

Alternative considered: retry the entire release job. That repeats expensive validation and artifact operations, gives weaker diagnostics, and still relies on manual dispatch after the job fails.

### Use bounded two-stage backoff

The workflow will make 18 attempts: short five-second delays for the first propagation window, then ten-second delays. The maximum wait is under three minutes. Each failed attempt emits a concise warning containing the version and next delay; the final error includes the recovery command.

Alternative considered: exponential backoff. It either waits too briefly at the beginning or makes the final delay unnecessarily long for a release workflow whose observed propagation delay is measured in seconds.

### Validate version metadata and download together

`npm view` must return the exact requested version and a non-empty HTTPS tarball URL. The workflow then downloads that URL with curl failure handling. A metadata response without a retrievable artifact is still considered unavailable and retried. The checksum and formula are produced only from the downloaded artifact.

Alternative considered: construct the tarball URL directly. Reading published metadata avoids assuming registry filename rules and ensures the formula points at npm's canonical artifact.

### Isolate handoff logic in a release-only helper

A small strict TypeScript helper will query npm metadata through the configured npm CLI, parse an exact-version response, download the HTTPS tarball atomically, and own retry/backoff diagnostics. The workflow calls it after `npm ci`, using the existing `tsx` toolchain. Unit tests inject query, download, sleep, and logging functions so transient metadata and download failures are verified without network access or a new dependency.

Alternative considered: embed the loop in workflow shell. That is harder to unit test, makes JSON validation fragile, and turns release correctness into string-only workflow assertions.

## Risks / Trade-offs

- [A persistent npm outage holds a macOS runner for the retry window] → Cap the wait below three minutes and fail explicitly.
- [A tarball becomes visible after the final attempt] → Preserve the exact workflow-dispatch recovery command in the error.
- [A malformed metadata response could select the wrong artifact] → Parse JSON and require an exact version match plus an HTTPS tarball URL.
- [The formula branch moves during the wait] → Retain the existing final `origin/master` equality check before commit.

## Migration Plan

1. Ship the workflow and contract tests as a patch release.
2. Observe that release's automatic Homebrew job across the normal npm propagation delay.
3. If the wait fails persistently, use the documented manual recovery command; rollback is a normal revert because no package or formula is mutated by the wait itself.

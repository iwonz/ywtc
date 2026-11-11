# Design

## Context

See `proposal.md` for motivation. The workflow currently creates one local npm archive, publishes it only when the version is absent, and always uploads that local file to GitHub. On recovery the version already exists, but a fresh `npm pack` can produce different gzip bytes from the registry tarball even when package contents are identical. The terminal gate correctly compares exact SHA-256 values across npm, GitHub, and Homebrew.

## Goals / Non-Goals

**Goals:**

- Preserve local packing and validation as the input to first-time npm publication.
- Converge fresh publication and recovery on one byte-authoritative artifact after npm accepts or already contains the version.
- Reuse the bounded registry polling/downloading logic already used by Homebrew.
- Keep immutable tags and duplicate npm publication protections unchanged.

**Non-Goals:**

- Do not make npm pack gzip output deterministic or treat equal unpacked contents as equal artifacts.
- Do not replace or move release tags, overwrite npm versions, or bypass digest verification.
- Do not change package contents, formula rendering, or release credentials.

## Decisions

### Replace the local archive with the observable registry tarball after publish-or-reuse

The publish job will retain the locally packed archive until `npm publish` succeeds or confirms the version already exists. A following step will use the registry handoff tool to download the exact published tarball to the same versioned archive path, then regenerate the checksum before GitHub upload. This makes the registry artifact authoritative only after publication while keeping first-time publication auditable.

Alternative considered: keep the existing GitHub asset when npm already contains the version. That cannot repair an asset already overwritten by a non-identical recovery pack and cannot prove the channel digests agree.

### Load the current handoff tool for recovery

Manual recovery will materialize `npm-registry-handoff.ts` beside the other current trusted release tools and invoke that copy. Its command entry point will use an async `main()` with explicit failure handling so the external file remains executable when `tsx` selects CommonJS outside the repository package boundary. Old tag source remains unchanged, while retry/backoff and exact-version validation match current release policy.

Alternative considered: invoke the tagged handoff script or add a temporary module-type package file. Older tags may lack the current bounded handoff or contain the defect being recovered, while an extra package file makes recovery placement part of correctness; both weaken the existing portable recovery-tool model.

### Enforce artifact data flow and ordering in a workflow contract test

The focused tests will execute the handoff entry point from a temporary external directory, require current handoff-tool loading for recovery, and order local pack, publish-or-reuse, registry download, checksum regeneration, and GitHub upload. Existing unit tests continue to exercise bounded retry behavior and terminal digest validation.

## Risks / Trade-offs

- [Fresh publication waits for registry propagation] → Use the existing bounded retry/backoff and actionable recovery error.
- [Registry download overwrites the validated local pack] → Perform it only after publish-or-existing succeeds, then let the terminal gate compare exact bytes across all channels.
- [Recovery of an old tag lacks the helper] → Load the helper from current trusted `master` without modifying tagged source.

## Migration Plan

1. Land the authoritative registry-archive data flow and ordering test on `master`.
2. Rerun authorized recovery for `v5.4.7`; overwrite the mismatched GitHub asset and checksum with exact registry bytes.
3. Require the existing Homebrew formula and final completion gate to pass.
4. Review the updated Release Please patch and complete its publication through the same gate.

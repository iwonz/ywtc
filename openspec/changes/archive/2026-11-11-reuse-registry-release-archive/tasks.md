# Tasks

## 1. Registry-authoritative release assets

- [x] 1.1 Add failing process and workflow contract tests for an externally loaded current registry handoff plus pack, publish-or-reuse, registry download, checksum, and GitHub upload ordering.
- [x] 1.2 Make the registry-handoff entry point portable, download the exact observable registry tarball after publish-or-reuse, regenerate its checksum before upload, and verify focused release and registry-handoff tests pass.

## 2. Integration verification

- [x] 2.1 Run `npm run check` and verify the complete quality gate passes without weakening publication, recovery, digest, or registry retry checks.

## Workflow follow-up

- Archive `reuse-registry-release-archive`, run post-archive strict validation, and commit/push the audited fix from recorded base `72f5151fe7687ac87db5598c8eeccd5ab45980a6`.
- Run idempotent recovery for existing `v5.4.7`, repair GitHub assets from npm registry bytes, and require `Verify complete release` to pass.
- Review, merge, and fully publish the Release Please patch containing all release fixes; report completion only after its own final gate succeeds.

# Tasks

## 1. Portable recovery packer

- [x] 1.1 Add a process-level regression test that executes the real packer entry point from a temporary directory outside the repository package boundary, and verify it fails on the current top-level-await transform.
- [x] 1.2 Replace top-level await with an async command entry point and explicit failure handling, then verify the focused regression and release tests pass.

## 2. Integration verification

- [x] 2.1 Run `npm run check` and verify the complete quality gate passes without weakening checks or adding ignores.

## Workflow follow-up

- Archive `make-release-recovery-packer-portable`, run post-archive strict validation, and commit/push the audited fix from recorded base `78a0be8a3a9a8789514413739cd080556e627754`.
- Run idempotent recovery for existing `v5.4.7` and require Homebrew plus `Verify complete release` to pass without moving the tag or republishing npm.
- Review, merge, and fully publish the Release Please patch generated for this recovery fix; report completion only after its own final gate succeeds.

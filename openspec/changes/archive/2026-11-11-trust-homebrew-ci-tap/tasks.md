# Tasks

## 1. Scoped Homebrew verification trust

- [x] 1.1 Add a focused workflow contract test that requires the isolated tap to be trusted after candidate staging and before strict audit, and verify it fails against the current workflow.
- [x] 1.2 Add tap-scoped trust to the Homebrew verification step before the first formula load, then verify the focused release tests pass.

## 2. Integration verification

- [x] 2.1 Run `npm run check` and verify the complete quality gate passes without weakening Homebrew audit, installation, formula test, or CLI checks.

## Workflow follow-up

- Archive `trust-homebrew-ci-tap`, run post-archive strict validation, and commit/push the audited fix from recorded base `b377a08092bfcfed24feb92eaae82fbd59c8bdd7`.
- Run idempotent recovery for existing `v5.4.7` and require Homebrew plus `Verify complete release` to pass without moving the tag or republishing npm.
- Review, merge, and fully publish the Release Please patch containing both recovery fixes; report completion only after its own final gate succeeds.

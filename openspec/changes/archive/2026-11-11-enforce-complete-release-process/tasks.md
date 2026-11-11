# Tasks

## 1. Release evidence verifier

- [x] 1.1 Add focused tests for a complete cross-channel release snapshot and for GitHub, npm, checksum, formula, and version mismatches; run the targeted Vitest file and confirm the new tests fail because the verifier does not exist.
- [x] 1.2 Implement the pure validator, network/file loader, and `npm run release:verify -- vX.Y.Z` command; verify the targeted tests pass without live network access.

## 2. Terminal workflow and canonical guidance

- [x] 2.1 Add workflow/documentation contract assertions requiring the read-only `release-complete` job after npm and Homebrew and requiring README/AGENTS to define source push as pending; run the targeted tests and confirm they fail for the missing contract.
- [x] 2.2 Add the final workflow job and update README/AGENTS with the exact two-phase completion rule; verify the targeted release tests pass.

## 3. Integration verification

- [x] 3.1 Run `npm run check` and verify the complete repository quality gate succeeds without weakening checks or adding ignores.

## Workflow follow-up

- Archive `enforce-complete-release-process`, run post-archive strict validation, and commit/push the audited source change from the recorded base `6f7731afa4c9b7a8a64bd94cf15f85ec6e64f75f`.
- Wait for Release Please PR `#44` to update; review that it contains only the four permitted metadata files and still proposes `5.4.7`, then merge it without adding substantive changes.
- Monitor the resulting workflow through `release-complete`; verify `v5.4.7`, GitHub assets and installation notes, npm/npx `5.4.7`, and the committed Homebrew formula before reporting release completion.

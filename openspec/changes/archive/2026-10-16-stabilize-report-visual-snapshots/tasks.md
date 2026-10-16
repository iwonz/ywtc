# Tasks

## 1. Deterministic report typography

- [x] 1.1 Add the self-hosted Inter variable font build dependency and import only the Latin/Cyrillic weight subsets; verify the generated single-file shell embeds WOFF2 data and contains no external font URL.
- [x] 1.2 Rebuild the report shell and refresh the four intentional visual baselines; verify desktop/mobile and light/dark snapshots pass locally at the existing strict threshold.
- [x] 1.3 Extend package validation for the embedded font artifact and verify an isolated tarball installation generates a font-complete report without source-checkout files.

## 2. Integration verification

- [x] 2.1 Run `npm run check` on the supported local runtime and fix all failures without relaxing the visual comparison gate.
- [x] 2.2 Run the strict OpenSpec validation and verify all change artifacts and requirements are valid before archival.

## Workflow follow-up

- Archive the change after every tracked task is complete and run strict validation again.
- Compare `master` with `origin/master`, commit the release fix, push without rewriting history, and verify Linux CI before completing the existing `3.5.0` publication flow.

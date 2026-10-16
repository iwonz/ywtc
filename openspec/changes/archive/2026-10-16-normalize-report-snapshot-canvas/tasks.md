# Tasks

## 1. Portable visual snapshots

- [x] 1.1 Add fixed minimum desktop/mobile canvases to the full-page Playwright visual scenarios; verify production report CSS and the existing pixel-difference threshold remain unchanged.
- [x] 1.2 Regenerate and visually inspect all four baseline images; verify every report section remains visible and only trailing background is added.

## 2. Integration verification

- [x] 2.1 Run `npm run check` on Node 26 and verify browser, package, static, unit, and strict OpenSpec gates pass.
- [x] 2.2 Validate the OpenSpec change in strict mode before archival.

## Workflow follow-up

- Archive the change and repeat strict validation.
- Compare with `origin/master`, commit and push without rewriting history, then verify both Linux quality jobs before continuing the `3.5.0` release.

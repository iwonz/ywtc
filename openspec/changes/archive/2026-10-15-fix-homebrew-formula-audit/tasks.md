# Tasks

## 1. Canonical formula generation

- [x] 1.1 Emit canonical metadata order, `std_npm_args`, and standard bin linking; verify generator tests reject the legacy install command and match the supported formula shape.
- [x] 1.2 Generate a representative formula and verify it with local Homebrew style/strict audit where available, then run the complete `npm run check` gate.

## Workflow follow-up

- Archive the change and rerun strict OpenSpec validation.
- Commit and push after a fresh `origin/master` comparison.
- Dispatch `v2.0.0` recovery and verify all Homebrew and installation channels.

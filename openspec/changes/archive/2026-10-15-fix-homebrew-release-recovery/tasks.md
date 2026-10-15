# Tasks

## 1. Homebrew recovery condition

- [x] 1.1 Gate Homebrew on explicit successful `publish-npm` completion with skipped-ancestor-safe evaluation; verify workflow tests assert both clauses and README recovery documentation remains accurate.
- [x] 1.2 Run focused workflow tests and the complete `npm run check` quality gate without weakening permissions or verification.

## Workflow follow-up

- Archive the change and rerun strict OpenSpec validation.
- Commit and push after a fresh `origin/master` comparison.
- Dispatch `v2.0.0` recovery again and verify Homebrew plus all installation channels.

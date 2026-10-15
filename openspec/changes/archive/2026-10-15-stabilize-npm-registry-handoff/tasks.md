# Tasks

## 1. Registry handoff

- [x] 1.1 Add a strict release-only registry handoff helper with exact-version metadata parsing, HTTPS validation, atomic download, bounded two-stage backoff, and actionable timeout diagnostics; verify focused unit tests cover immediate success, transient metadata failure, transient download failure, malformed metadata, and exhausted retries.
- [x] 1.2 Replace the Homebrew job's single registry lookup/download with the helper while preserving checksum generation and downstream verification; verify workflow contract tests assert the helper invocation, retry bounds, and absence of the old one-shot lookup.

## 2. Integration verification

- [x] 2.1 Validate workflow YAML and run the focused release tests, verifying the workflow remains syntactically valid and least-privileged.
- [x] 2.2 Run `npm run check` and verify the complete lint, typecheck, unit, browser, Knip, build, package, and OpenSpec suite passes.

## Workflow follow-up

- Archive the change and validate all synchronized OpenSpec content.
- Publish the resulting patch release and verify its automatic Homebrew job absorbs npm registry propagation without manual recovery.

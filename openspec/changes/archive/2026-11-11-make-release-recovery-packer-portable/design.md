# Design

## Context

See `proposal.md` for motivation. Recovery deliberately loads current audited release tools while checking out an older immutable tag. Those tools are written to a temporary directory so the tagged tree remains unchanged, but that directory has no `package.json` declaring ESM. The existing entry point uses top-level `await`, which `tsx` cannot transform when it selects CommonJS for that external path.

## Goals / Non-Goals

**Goals:**

- Preserve the same shared `packRelease` implementation and staging behavior.
- Make the thin command entry point valid when loaded from either repository ESM context or the temporary recovery directory.
- Reproduce the external-directory execution in a deterministic regression test.

**Non-Goals:**

- Do not alter archive contents, dependency selection, version identity, retry rules, or publication permissions.
- Do not modify tagged source during recovery or replace the existing recovery workflow.
- Do not create or move a release tag or republish an immutable npm version.

## Decisions

### Wrap entry-point work in an async `main`

The command will call an async `main()` and attach an explicit rejection handler instead of evaluating `await` at module top level. Both ESM and CommonJS transforms can execute that shape, while the shared `packRelease` helper and output contract remain unchanged.

Alternative considered: add a temporary `package.json` with `"type": "module"`. That creates an extra recovery artifact whose placement becomes part of correctness and does not make the entry point itself portable.

### Exercise the real temporary module boundary in Vitest

The regression test will copy the entry point into an OS temporary directory beside a minimal `release-package.ts` stub and invoke it through the same `node --import tsx` mechanism as the workflow. This fails on the current top-level-await transform before the stub can run and passes only when the external entry point is executable.

Alternative considered: assert source text does not contain top-level `await`. A process-level test better captures loader and module-format behavior without prescribing the exact source spelling.

## Risks / Trade-offs

- [The rejection handler could change CLI failure output] → Preserve a non-zero exit code and print the original error message without catching successful output.
- [Temporary-process tests can leak files] → Use an OS temp directory and remove it in `finally`.
- [The fix changes source after `v5.4.7`] → Recovery intentionally loads trusted tools from current `master` while operating on unchanged tagged source; publication remains idempotent and the final gate verifies channel identity.

## Migration Plan

1. Land the portable entry point and regression test on `master`.
2. Run `workflow_dispatch` recovery for existing tag `v5.4.7` so it loads the fixed current packer.
3. Require Homebrew and `Verify complete release` to pass; do not move the tag or republish npm.
4. Let Release Please calculate the normal patch release for this audited source fix and complete that release through the same terminal gate.

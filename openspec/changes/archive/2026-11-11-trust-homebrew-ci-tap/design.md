# Design

## Context

See `proposal.md` for motivation. The Homebrew job intentionally copies the generated formula into a temporary non-git tap so audit, installation, and tests exercise the exact candidate without reading the repository formula. Current Homebrew rejects any formula load from that non-official tap until the tap or formula is explicitly trusted.

## Goals / Non-Goals

**Goals:**

- Preserve the isolated-tap verification model and every existing formula check.
- Use Homebrew's tap-scoped trust interface immediately before the first command that loads the staged candidate.
- Make command ordering an executable workflow contract.

**Non-Goals:**

- Do not disable Homebrew trust enforcement or developer safety checks.
- Do not trust the repository globally, trust arbitrary third-party taps, or persist trust outside the ephemeral runner.
- Do not change formula rendering, npm registry handoff, release identity, or publication permissions.

## Decisions

### Trust the temporary tap, not individual commands or all taps

The verification step will run `brew trust --tap "$tap_name"` after `brew tap-new` and candidate copy, and before `brew audit`. This is the same explicit interface documented for operator installation, covers audit/install/test for one ephemeral tap, and disappears with the hosted runner.

Alternative considered: trust only the formula with `--formula`. Tap-scoped trust better matches all subsequent fully qualified formula operations and the existing public installation contract while remaining narrowly bounded.

### Test workflow ordering as a contract

A focused Vitest assertion will require tap creation, candidate staging, scoped trust, strict audit, install, test, and version check in that order. This catches removal or accidental relocation before the workflow reaches a macOS runner.

Alternative considered: assert only that the workflow contains `brew trust`. Presence alone would not detect trust occurring after the first formula load or against the wrong target.

## Risks / Trade-offs

- [Homebrew changes trust syntax again] → Keep the explicit `--tap` form covered by the locally available Homebrew help and fail visibly at the formula gate.
- [Trust broadens beyond the candidate formula] → Scope it to the unique ephemeral `iwonz/ywtc-ci` tap and retain every audit/install/test check.
- [Recovery reprocesses existing release assets] → Use the existing idempotent recovery path; it verifies npm/GitHub state without moving the tag or republishing the version.

## Migration Plan

1. Land the workflow ordering change and regression test on `master`.
2. Rerun authorized recovery for `v5.4.7`; require the Homebrew commit and final completion gate to pass.
3. Review the updated Release Please patch and complete its release through the same terminal gate.
4. If the workflow still fails, leave the formula unchanged and recover the same immutable tag after correcting the verified cause.

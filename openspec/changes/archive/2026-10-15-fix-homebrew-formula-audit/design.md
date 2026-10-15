# Design

## Context

See `proposal.md` for motivation. Current Homebrew audit rejects the generator's `sha256`/`version` order and direct `npm install --global --prefix ... cached_download` invocation. Current Formula API exposes `std_npm_args`, which packs the staged source and installs it under `libexec` with Homebrew's Node environment and security arguments.

## Goals / Non-Goals

**Goals:**

- Generate a formula accepted by current `brew style` and `brew audit --strict`.
- Preserve installation from the exact registry tarball and the functional CLI test.

**Non-Goals:**

- Vendoring npm dependencies as separate Homebrew resources.
- Disabling npm lifecycle protections or Homebrew security arguments.

## Decisions

Emit metadata as `url`, explicit `version`, `sha256`, then `license`. In `install`, run `system "npm", "install", *std_npm_args` and link `libexec.glob("bin/*")`. Homebrew stages the registry tarball as the formula build source; the helper creates an installation tarball from that staged source and installs it into `libexec` using supported arguments.

This is preferred to suppressing audit cops or keeping a custom install command because the helper tracks Homebrew's security and npm compatibility behavior.

## Risks / Trade-offs

- **Homebrew changes the helper contract again** → Strict audit, real install, formula test, and version invocation run on every release.
- **Lifecycle scripts are needed by a future dependency** → The default helper intentionally ignores scripts; any exception requires a separately reviewed change rather than weakening the formula globally.

## Migration Plan

1. Push the generator correction and wait for quality gates.
2. Dispatch the idempotent `v2.0.0` recovery again.
3. Verify style, strict audit, install, test, formula commit, and tap installation.

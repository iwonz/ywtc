# Design

## Context

See `proposal.md` for motivation. The project runs Playwright through `npm run check`, and `playwright.config.ts` selects only Chromium. GitHub-hosted runner images are not the source of truth for Playwright browser binaries; the installed `@playwright/test` package is.

The workflow has two browser-bearing paths: the Node version matrix and tagged-release validation. Both install dependencies with `npm ci`, so browser provisioning must happen after that command and before the complete check.

## Goals / Non-Goals

**Goals:**

- Make browser checks independent of GitHub runner image contents.
- Use the Chromium revision associated with the lockfile's Playwright dependency.
- Protect both ordinary CI and pre-publication validation with executable workflow contract tests.

**Non-Goals:**

- Installing Firefox or WebKit when the maintained suite does not select them.
- Changing Playwright configuration, browser snapshots, product runtime dependencies, or local developer setup.
- Retrying or bypassing a failed browser installation.

## Decisions

### Install only Chromium with Playwright's dependency installer

Each browser-bearing job runs `npx playwright install chromium --with-deps` after `npm ci`. This follows Playwright's CI contract, installs the browser revision matching the locked CLI, and includes Linux system packages needed by the browser.

Installing every Playwright browser was rejected because the suite selects Chromium only and additional downloads increase CI time and failure surface. Relying on runner-provided Chrome or setting a browser channel was rejected because it decouples CI from the lockfile and changes the tested browser.

### Provision independently in quality and publication paths

The matrix quality job gets a dedicated provisioning step. The publication job provisions Chromium within its existing install-and-validate script immediately after `npm ci`, including manual recovery runs.

Depending only on the earlier quality job's filesystem was rejected because GitHub jobs use separate runners. Caching browser binaries is not required for correctness and can be introduced later without changing this contract.

### Enforce ordering with workflow contract tests

The release tests inspect each affected workflow segment and assert exactly one provisioning command occurs after dependency installation and before the complete check. This prevents a superficially present command in an unrelated job from satisfying the test.

## Risks / Trade-offs

- **[Longer CI setup]** → Install Chromium only; let the Playwright installer skip an already cached compatible binary when available.
- **[Hosted-runner package changes]** → Use `--with-deps` so Playwright owns the supported Linux dependency set; installation failure stops the gate explicitly.
- **[Workflow text assertions become brittle]** → Scope assertions to stable job boundaries and command ordering rather than full YAML snapshots.

## Migration Plan

1. Add failing workflow contract tests for both browser-bearing paths.
2. Add Chromium provisioning at the required locations.
3. Run the complete local gate and push normally.
4. Confirm both GitHub Actions matrix jobs pass on clean hosted runners.

Rollback consists of reverting this workflow change; no runtime data or published package state is migrated.

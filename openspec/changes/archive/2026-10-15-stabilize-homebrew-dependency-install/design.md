## Context

The formula now passes strict Homebrew audit and resolves the published package as version 2.0.0. Installation fails because `std_npm_args` deliberately passes `--min-release-age=1`, while pinned `@diplodoc/transform@4.78.7` and `dotenv@18.0.8` were published less than one day before the release check. The immediately preceding `4.78.6` and `18.0.7` releases are older than one day and install successfully with the same protection enabled.

## Goals / Non-Goals

**Goals:**

- Make the next immutable npm artifact installable through canonical Homebrew npm arguments.
- Preserve the one-day supply-chain cooldown for every dependency.
- Retain current conversion behavior through the closest preceding compatible patch release.

**Non-Goals:**

- Retrofitting the immutable npm `2.0.0` artifact.
- Disabling release-age protection or maintaining an exception list.
- Changing CLI, migration, retry, resume, conflict, or degradation semantics.

## Decisions

### Pin the closest cooldown-eligible patches

`@diplodoc/transform` will move from exact `4.78.7` to `4.78.6`, and `dotenv` from exact `18.0.8` to `18.0.7`. Temporary `/tmp` installation with npm 11 and `--min-release-age=1` verifies the selected graph. Adding `--min-release-age-exclude` was rejected because it would permanently bypass protection for future releases. Waiting for the existing packages to age was rejected because it would leave the supported Homebrew channel incomplete and non-reproducible during the release window.

### Publish the correction as 2.0.1

npm artifacts are immutable, so `2.0.0` remains available through npm and GitHub. The dependency correction joins the existing Release Please patch and is published as `2.0.1`; the formula is generated from that exact registry tarball.

No product retry, resume, conflict, or content-degradation behavior changes. Release retries remain idempotent and never overwrite npm versions.

## Risks / Trade-offs

- **[The preceding patches differ from the freshest releases]** → Run all conversion, configuration, integration, browser, build, and package smoke tests before release.
- **[Another dependency violates cooldown]** → Preflight the selected graph with npm's one-day filter and retain the real Homebrew installation gate.
- **[An upstream security fix exists only in a freshest release]** → Runtime audit reports no high or critical issue from the selected graph; future eligible upgrades can restore newer patches after the cooldown.

## Migration Plan

1. Update the exact dependency and lockfile.
2. Verify the cooldown-filtered graph and complete quality gate.
3. Merge the regenerated `2.0.1` Release Please pull request.
4. Verify npm, GitHub, npx, and Homebrew publication from the immutable `2.0.1` artifact.

Rollback is a later patch release with another audited dependency version; published artifacts are never rewritten.

## Open Questions

None.

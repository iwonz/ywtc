# Design

## Context

See `proposal.md` for motivation. GitHub evaluates default downstream job conditions across skipped ancestors. During `workflow_dispatch`, Release Please is intentionally skipped; `publish-npm` opts back in with `always()` and succeeds, but Homebrew lacks an explicit condition and is skipped.

## Goals / Non-Goals

**Goals:**

- Make the direct publication result the only workflow-state prerequisite for Homebrew.
- Preserve failure isolation and all existing Homebrew verification.

**Non-Goals:**

- Running Homebrew after failed or skipped publication.
- Changing formula generation, audit, install, test, commit, or push behavior.

## Decisions

Add a job-level condition equivalent to `always() && needs.publish-npm.result == 'success'` on Homebrew. `always()` prevents a skipped transitive ancestor from suppressing evaluation, while the explicit result check prevents formula work after publication failure.

This is preferred to adding Release Please as a direct dependency, duplicating Homebrew in a recovery workflow, or treating a skipped release-proposal job as success.

## Risks / Trade-offs

- **`always()` could appear to run after failure** → The conjunction requires the direct publication job's exact `success` result.
- **Concurrent master movement can still block the formula commit** → Existing fetch, SHA comparison, and non-force push behavior intentionally fail safely; the same recovery tag can be dispatched again.

## Migration Plan

1. Push the workflow correction and wait for quality gates.
2. Dispatch recovery for `v2.0.0` again; npm and GitHub artifact steps remain idempotent.
3. Verify the Homebrew job, formula commit, tap installation, and subsequent master CI.

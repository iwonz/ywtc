# Design

## Context

See proposal.md. The first Linux run of the shared UI failed on three independent boundaries: the floating current alias installed Node 27 alpha (Next headers and PNG decoder incompatibilities), strict screenshots exposed system monospace variation, and a restarted browser worker lost a session assumed by a later scenario.

## Goals / Non-Goals

Keep strict cross-platform screenshots and independently runnable browser scenarios. Preserve all migration, retry, identity, outcome, exit-code and information-preservation contracts; no provider writes or real workspaces.

## Decisions

- Replace floating current with the explicit current stable major 26, alongside minimum major 24. Do not patch Next internals or accept alpha failures as product failures.
- Remove report metadata reliance on host monospace fonts by using the embedded interface typeface. CDP inspection confirms both hosts use custom Inter but their variable-font rasterization differs at identical geometry; maintain explicitly platform-keyed, reviewed baselines with the same 1% threshold for both hosts.
- Establish a fixture cookie for every test context, including freshly restarted workers. Keep a browser bootstrap-flow assertion independently so API fixture setup does not remove bootstrap coverage.
- Refresh only reviewed baselines affected by corrected font geometry; do not add blank canvas or suppress visual tests.
- Linux reproduction in `/work` exposed the standalone scrubber replacing unrelated `/worker` and `/workspaces` prefixes. A directory-name boundary must distinguish real checkout paths from longer identifiers; verify pure string fixtures and a real standalone browser run in that short checkout path.

## Risks / Trade-offs

Explicit stable majors need routine maintenance when supported releases change. Rasterization differs across hosts; separate maintained baselines retain the existing strict tolerance. Interface identifiers become proportional, still selectable and legible; file/code payloads and sandboxed content are unchanged.

## Deployment

Run isolated/fresh-worker browser reproductions, the full local check and Linux browser suite, archive and validate, then publish with the pending UI patch. Rollback is a normal follow-up commit, never rewriting release history.

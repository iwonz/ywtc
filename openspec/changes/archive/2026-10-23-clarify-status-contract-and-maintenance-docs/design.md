# Design

## Context

See `proposal.md` for the problem. The maintained README has nine H2 sections enforced by `scripts/readme-contract.mjs`. Status vocabularies live in `src/state.ts` and `src/domain.ts`; assignment and finalization live in migration, comment, export, report, and retry modules. Active specifications have accumulated older alternatives alongside newer requirements.

## Goals / Non-Goals

**Goals:** make the current outcome contract inspectable, distinguish an outcome from error severity and retryability, and give each operational rule one canonical documentation location.

**Non-Goals:** change status assignment, repair dormant status producers, refactor migration code, modify runtime data, or publish a new package version for documentation alone.

## Decisions

1. Keep the current nine README sections. Within `Отчёты и статусы`, use separate tables for pages, files, comment archives, Grid snapshots, mentions, runs, and traversal edges. Each status has numbered conditions and an action. Describe `discovered`/`skeleton-created` as intermediate and enum-only values as reserved rather than inventing reachable causes.
2. Ground conditions in assignment branches, including finalization. `not-started`, `failed`, and `blocked` do not prove that destination data is absent. Run status, page completeness, issue severity, exit code, and retry selection remain distinct dimensions.
3. Preserve complete MODIFIED blocks. Where consolidation removes duplicate scenarios, explicitly retire the old requirement with its replacement named and add the consolidated requirement; this makes the removal reviewable and preserves unique coverage under OpenSpec's scenario-retention guard. Update the universal migration Purpose directly as OpenSpec requires. Archived changes and changelog remain historical evidence.
4. Use README for operator instructions, current specifications for observable behavior, AGENTS for the contributor workflow and responsibility map, and `openspec/config.yaml` for concise stable context. Validate full proposed commit messages before creating commits and verify the actual new range before pushing.
5. Extend `scripts/readme-contract.mjs` only for structural status-table validation. Unit tests read runtime union definitions and compare their values with the relevant documented tables, so a future added status cannot silently drift. Existing quality checks cover the rest of the repository.

## Files and Verification

- `README.md`: current operations and exhaustive numbered status tables; verify commands against `src/cli-arguments.ts`, locators/config/workspace, assignment branches, and README contract tests.
- `AGENTS.md`, `openspec/config.yaml`: one contributor workflow and documentation responsibility map; verify commands against package scripts and OpenSpec instructions.
- Six existing specifications named in the proposal: consolidate full affected requirements; validate before implementation and after archive.
- `scripts/readme-contract.mjs`, `tests/readme-contract.test.ts`: table conditions and union coverage; focused tests, then the required full `npm run check`.

## Risks / Trade-offs

- Exhaustive status reference increases the reports section length → keep prose short, use numbered conditions only in the status tables, and remove repeated status explanations elsewhere.
- Existing implementation has reserved statuses and differs from some older promises → describe actual behavior explicitly without silently changing completeness or retry semantics.
- Specification consolidation could lose coverage → preserve full modified requirement blocks and compare removed scenarios with their surviving equivalents before archive.

## Delivery

Complete the quality gate, archive and revalidate, recheck the remote base, validate the entire commit message, and push a documentation Conventional Commit. No product version bump or destination mutation is needed.

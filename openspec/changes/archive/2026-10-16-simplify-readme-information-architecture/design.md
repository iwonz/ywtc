# Design

## Context

See `proposal.md` for motivation. The current README is accurate and release-tested, but its thirteen historical sections distribute closely related information across separate headings. The repository release check hard-codes that structure and checklist syntax, so the document and validator must change together. Runtime behavior, the report UI, and public CLI remain authoritative and unchanged.

## Goals / Non-Goals

**Goals:**

- Optimize the document for two reading paths: a first successful interactive run and precise reference lookup.
- Keep every current command, option, connection field, compatibility boundary, fidelity guarantee, status, and safety rule discoverable.
- Make each topic canonical in one place and reduce prose that repeats a table or another section.
- Preserve release-time validation of the README's public contract without preserving accidental formatting constraints.

**Non-Goals:**

- Change CLI parsing, defaults, provider support, transfer semantics, state identity, report data, or package contents.
- Add a documentation site, generated command reference, new dependency, or translated README.
- Change the header illustration or report application.

## Decisions

### Use a nine-section task flow

The summary sits directly below `# ywtc`, followed by quick start, evaluation material, configuration, operation, durable runtime artifacts, and development. This removes headings whose only purpose was to separate adjacent steps.

Alternative: retain thirteen headings and shorten their bodies. Rejected because it preserves navigation overhead and forces related information into separate canonical homes.

### Keep exhaustive tables, compress explanatory prose

Configuration fields and CLI options remain complete tables because they are lookup data. Capabilities retain supported and limited tables because fidelity is a primary adoption decision. Narrative text is limited to invariants or relationships that tables cannot express.

Alternative: link users to `--help` and the example YAML instead of documenting parameters. Rejected because README must remain sufficient for evaluation and non-interactive setup.

### Merge equivalent status definitions

One table defines provider-neutral outcomes and identifies applicability to pages, files, and comment archives. Object-specific exceptions are expressed in the applicability or meaning column. Quality classifications remain a separate small table because they are orthogonal to object outcomes.

Alternative: retain page and file status tables. Rejected because six rows are semantically duplicated and encourage drift.

### Validate content paths rather than historical syntax

The release check validates the nine canonical headings and the presence of install/init/migrate quick-start commands plus the four high-frequency examples. It no longer requires checklist markers or old H2 names.

Alternative: remove README structural checks entirely. Rejected because packaging and release changes could silently drop critical operator paths.

## Risks / Trade-offs

- [Dense reference tables can still feel long] → Keep full tables but remove prose that merely rephrases their cells.
- [Moving content can accidentally omit an edge case] → Audit the new README against current CLI help, example config, and every modified OpenSpec scenario before checks.
- [Exact headings can become rigid again] → The nine headings represent durable user tasks; future changes may revise them through an explicit specification change, as this change does.
- [Terminology can mix Russian prose with public English identifiers] → Keep CLI flags, provider names, statuses, and file names verbatim while writing explanations in concise Russian.

## Migration Plan

1. Replace the README atomically with the new information architecture.
2. Update release validation and focused tests for the new headings and critical content paths.
3. Run the full project check and inspect the rendered Markdown structure.
4. Archive the OpenSpec delta into `project-maintenance`.

Rollback is a normal Git revert; no runtime data or published schema changes are involved.

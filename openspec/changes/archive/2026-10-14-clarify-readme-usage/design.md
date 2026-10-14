## Context

The README already contains all relevant commands and migration capabilities,
but its quick-start block mixes required and optional operations, while migration
coverage is compressed into one paragraph. The change is purely editorial and
must retain one canonical complete parameter reference.

## Goals / Non-Goals

**Goals:**

- Make the minimum safe migration path scannable as a task checklist.
- Separate optional high-frequency workflows into copyable examples.
- Make supported, transformed, degraded, and excluded content easy to compare.

**Non-Goals:**

- Changing CLI commands, defaults, migration behavior, or compatibility claims.
- Repeating every option or environment variable in the examples section.

## Decisions

The minimum checklist contains four operational steps after installation:
initialize a workspace, configure its `.env`, run the migration with
`--dry-run`, and repeat without `--dry-run`. `doctor` remains recommended through
the examples section but is not required to migrate.

Common examples use neutral public hosts and stable placeholder IDs. They cover
the five variants most likely to answer a concrete next question without
recreating the option table: diagnostics, `--single-page`, full URLs,
`--workdir`, and `--fresh`.

The migration table groups content by operator-visible category. Its result
column explains the transformation, while the limits column preserves current
fallback and exclusion rules.

## Risks / Trade-offs

- **Quick start becomes visually long** → Keep each checkbox to one action and
  one short command block.
- **Examples drift from CLI behavior** → Use only existing documented commands
  and keep option semantics canonical in the parameters table.
- **Coverage appears absolute** → State static Grid conversion, external-image
  behavior, readable fallbacks, and excluded entities explicitly.

## Migration Plan

Replace the two README sections, validate Markdown through project quality
gates, and archive the OpenSpec change. Rollback is a documentation revert.

## Open Questions

None.

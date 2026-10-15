## Context

The successful Node.js 24/current quality jobs emitted deprecation annotations for JavaScript actions backed by Node.js 20. Official latest releases are checkout v7.0.1, setup-node v7.1.0, and release-please-action v5.0.0.

## Decisions

- Track current action majors (`@v7`, `@v5`) so compatible patch updates arrive automatically.
- Change no workflow permissions or release inputs.
- Assert the majors in repository tests to prevent accidental rollback.

## Risks / Trade-offs

- Major action upgrades can change inputs or defaults. The existing workflow contract tests and a live push run verify the unchanged command surface.

## Migration Plan

Update all action references atomically, run the complete quality gate, archive this change, and publish a non-release-producing `ci` commit.

## Context

The CLI currently exposes six options through Node.js `parseArgs`, while the README only demonstrates a subset in command examples. The documentation must stay concise while giving operators an authoritative overview before they run a migration.

## Goals / Non-Goals

**Goals:**

- Add one clearly named CLI parameter reference section near the quick-start commands.
- Cover every option implemented in `src/cli.ts`.
- Show type, required status, accepted values or format, default, and practical meaning.
- Derive all constraints from the current parser and configuration schema.

**Non-Goals:**

- Changing argument names, parsing, defaults, validation, retry, resume, conflict, or content-degradation behavior.
- Duplicating the full environment-variable reference from `.env.example`.
- Adding real credentials, organization-specific values, or runtime migration data.

## Decisions

- Use a Markdown table because the fields are repeated across all options and readers need to compare them quickly.
- Give `default` its own column rather than combining it with required status, so environment-derived behavior such as `MIGRATION_CONCURRENCY` remains explicit.
- Describe `--source` and `--target` formats with neutral examples and document boolean flags as switches that take no value.
- Keep `.env.example` as the exhaustive environment-variable reference and retain a short link to it from the README.

## Risks / Trade-offs

- [Documentation can drift from parser behavior] → Verify every row against `src/cli.ts` and `src/config.ts` during this change.
- [A wide table can be less comfortable on narrow screens] → Use compact values and short descriptions while retaining all requested fields.

# Design

## Context

The README currently has fourteen second-level sections, including a historical v2 migration guide and a long release-maintainer section. Workspace concepts are named as profiles/workspace rather than Configuration, state and reports share one section, Installation follows the minimum flow, and the option table covers only `migrate`.

## Goals / Non-Goals

**Goals:**

- Give operators a stable reading order from product definition through setup, execution, recovery, and diagnostics.
- Keep each fact in one canonical location and preserve all current operational information needed to use every CLI command.
- Make future documentation changes deliberate by specifying the allowed second-level structure.

**Non-Goals:**

- Change CLI behavior, configuration schema, compatibility, release workflows, or state formats.
- Preserve historical pre-2.0 instructions in the README.
- Turn README into a complete internal release runbook.

## Decisions

### Fix only the second-level structure

The thirteen requested Russian headings are the complete H2 taxonomy and appear in the specified order. H3 subsections remain available for concepts that need local detail, such as profile fields, locators, scope, repeated runs, and release maintenance.

Alternative considered: prohibit all subsections. Rejected because token types, parameter classes, and state rerun semantics are easier to scan when grouped locally.

### Separate guided flow from reference material

Installation precedes the minimal checklist. Configuration owns workspace selection, the generated file layout, named profiles, secret precedence, network limits, and profile field references. Parameters owns the command matrix, the consolidated CLI option table, locator rules, and scope semantics.

### Keep state and reports independent

State explains canonical identity, automatic selection, resume, conflicts, `--fresh`, interruption, and repeated runs. Reports explains paths, formats, contents, and completion statuses. This prevents report behavior from being mistaken for state behavior.

### Keep Development concise

Development contains clone/install/check commands, the mandatory OpenSpec workflow reference, and one compact paragraph describing automated releases. Completed npm bootstrap instructions and manual recovery detail are omitted from README; the release specification and workflow remain the source of truth.

### Validate structure mechanically

Add a small repository check that parses README H2 headings and asserts the exact sequence. This converts the fixed information architecture from prose guidance into an enforceable quality gate without adding a runtime dependency.

## Risks / Trade-offs

- **Condensing text can hide an operational prerequisite** → Preserve every current command, configuration field, auth mode, compatibility boundary, state safety rule, and exit code in the appropriate canonical section.
- **A fixed structure can resist legitimate future capabilities** → Permit changes through an explicit OpenSpec update rather than ad hoc headings.
- **Release detail is less discoverable in README** → Keep the current automated model in Development and the authoritative behavior in `release-management` plus workflow code.
- **Tables can become wide** → Use compact values and move conceptual explanations into nearby H3 subsections.

## Migration Plan

1. Add the README heading-order validation to the existing release/hygiene check.
2. Rewrite README using the fixed section sequence and consolidate repeated content.
3. Run the complete project quality gate and archive the OpenSpec change.
4. Roll back through a normal Git revert if the new structure omits a required contract.

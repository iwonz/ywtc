## Context

The README already covers compatibility, credentials, setup, CLI options, state behavior, migration scope, development, and references. Its length comes mainly from restating details around the canonical tables and checklists. The document is public operational documentation, so compression must not weaken safety guidance or accepted-input definitions.

## Goals / Non-Goals

**Goals:**

- Reduce prose and repetition while preserving the existing information architecture and all operational facts.
- Use direct, neutral sentences and make tables, checklists, and commands carry the detailed contract.
- Keep security, retry/resume implications, conflict behavior, content-degradation scope, and version boundaries explicit.

**Non-Goals:**

- No CLI, API, migration, retry, resume, conflict, or conversion behavior changes.
- No compatibility-range, token-permission, or safety-policy changes.
- No redesign of the header image or project branding.

## Decisions

1. Keep the current section order so existing readers can find the same topics. A full restructuring would add review risk without improving the requested tone.
2. Preserve the compatibility and CLI tables verbatim except for shorter descriptions where meaning is unchanged. These are the canonical structured references.
3. Consolidate state behavior into compact bullets and one recovery paragraph. This preserves repeat-run and failure semantics without repeating the automatic-ID explanation.
4. Retain commands and credential checklists, but remove conversational transitions and duplicated reminders. Security warnings remain next to the action they constrain.

## Risks / Trade-offs

- [Risk] Compression could omit an accepted URL form or safety caveat. → Compare the revised README section-by-section and retain the full CLI table plus state scenarios.
- [Risk] More formal language could become harder to scan. → Prefer short sentences, checklists, tables, and concrete examples.
- [Risk] Amend changes the already published commit SHA. → Fetch the remote, verify it still equals the known base, and update with an explicit force-with-lease.

## Migration Plan

1. Revise only `README.md` after this change validates.
2. Run repository checks and archive the OpenSpec change.
3. Stage the documentation and archive, amend the existing root commit without changing its message, then push with a lease tied to the previously verified remote SHA.
4. If the remote moved, stop without overwriting it.

## Open Questions

None.

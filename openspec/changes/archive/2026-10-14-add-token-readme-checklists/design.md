## Context

The README quick-start names the required credentials but assumes operators already know the two vendor flows. The Yandex Wiki API supports user OAuth for Yandex 360 and Yandex Cloud organizations, while IAM is limited to Yandex Cloud and expires within 12 hours. Confluence Data Center 7.9+ users create PATs in their own settings and the token inherits that user's permissions.

## Goals / Non-Goals

**Goals:**

- Keep both token instructions short enough to scan during first-time setup.
- Prefer the least-privilege Yandex scope needed by this read-only source migrator (`wiki:read`).
- Map every obtained value directly to its `.env` variable.
- Link to the official Yandex and Atlassian source pages for version-specific detail.
- Reinforce one-time token copy and ignored `.env` storage.

**Non-Goals:**

- Automating browser-based token creation or storing tokens in documentation.
- Documenting OAuth application internals beyond the minimum setup path.
- Changing API authentication, retries, resume behavior, conflict handling, or content conversion.

## Decisions

- Put both checklists immediately after dependency installation and before the `.env` step, so the quick-start remains chronological.
- Document OAuth as the recommended Yandex path because it works for the long-running migration workflow; mention IAM only as the short-lived Yandex Cloud/federated alternative.
- State explicitly that Yandex API access can be disabled by an administrator and that Confluence PATs cannot exceed the user's existing permissions.
- Use vendor UI labels closely enough to be recognizable, while linking to official documentation rather than embedding screenshots that age quickly.

Alternative considered: a separate authentication guide. Rejected because the user requested a README section and the checklists are intentionally compact.

## Risks / Trade-offs

- **[Vendor labels change]** → Link each heading to the official living documentation and keep implementation-specific detail minimal.
- **[Operators request excessive Wiki permissions]** → Recommend `wiki:read`; the migrator reads Yandex Wiki and writes only to Confluence.
- **[A token is accidentally committed]** → Repeat that values belong only in ignored `.env`; examples contain placeholders only.

## Migration Plan

Edit the README, run release hygiene and the full project check, sync the updated documentation requirement, and archive the change. Rollback is removal of the two checklist subsections only.

## Open Questions

None.

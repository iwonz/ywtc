## Why

The quick-start currently tells operators to obtain tokens but does not explain where or how, forcing them to leave the setup flow and reconstruct product-specific steps. Short, authoritative checklists will make first-run configuration self-contained without exposing credentials.

## What Changes

- Add a concise Yandex Wiki checklist covering OAuth application creation, the minimum `wiki:read` scope, token issuance, organization ID lookup, and the matching `.env` fields.
- Add a concise Confluence Data Center 7.9+ checklist covering the user-profile PAT screen, naming/expiry, one-time copy, permission inheritance, and the matching `.env` fields.
- Link each checklist to the official vendor documentation and retain the rule that real tokens belong only in ignored `.env` files.
- Non-goals: the project will not generate tokens, request extra write scopes, store example credentials, change authentication behavior, or alter any remote data.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `project-maintenance`: The public README setup contract now explicitly includes vendor-verified token acquisition checklists.

## Impact

- Documentation-only change to `README.md` plus its OpenSpec artifacts.
- No runtime code, API behavior, dependencies, secrets, or migration state are changed.

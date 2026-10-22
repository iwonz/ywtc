# Proposal

## Why

A completed large transfer exposed a small set of systemic correctness problems: provider-normalized internal links can fail semantic verification, recovered consistency events remain counted as warnings, attachment read-back failures erase proven upload outcomes, comment archives without files still depend on attachment permissions, and arbitrary source text can corrupt the generated HTML report during string replacement. These defects inflate failure counts, make targeted retry less precise, and can make the local report unnecessarily large or malformed even when most content transferred successfully.

## What Changes

- Canonicalize internal page references for semantic verification so provider-added IDs, titles, and equivalent serialization compare as the same mapped destination identity.
- Preserve successful upload evidence when destination attachment read-back is unavailable, while retaining an explicit unverified outcome until verification succeeds.
- Avoid attachment API calls for comment archives that do not require an uploaded archive resource.
- Distinguish recovered consistency events from unresolved warnings and derive retry counts only from current unresolved outcomes.
- Harden report payload injection against JavaScript replacement-string metacharacters and bound large-report preview payloads without removing problem diagnostics.
- Improve deterministic recovery for transient create/read inconsistencies and expose complete outcome accounting for Grid resources.
- Protect literal template syntax from vendor interpolation where it is source text and retain safe fallbacks for renderer failures.
- Preserve the non-destructive boundary: no source or destination content, attachments, comments, state, or reports are automatically deleted.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `wiki-migration`: strengthen semantic link verification, destination consistency recovery, resource verification, transformation isolation, report integrity, and reconciled current-outcome accounting.
- `comment-archives`: remove unnecessary attachment capability dependency for archives with no attachment payload and preserve independently verifiable comment outcomes.
- `targeted-run-retry`: select only currently unresolved actionable outcomes and exclude already recovered historical events.

## Impact

The change affects the normalized content verifier, Confluence rendering and recovery paths, remote resource and comment transfer orchestration, issue accounting, retry planning, report serialization, report payload construction, and their unit/integration/browser fixtures. Public CLI syntax, state identity, provider profiles, and non-destructive behavior remain unchanged.

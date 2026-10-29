# Design

## Context

See proposal.md. settingsSnapshot currently throws whenever readExistingInteractiveConfig reports a schema error, and updateSettings cannot preserve secrets from invalid files. CLI strict validation is correct and remains unchanged; the browser needs a separate safe editing view.

## Goals / Non-Goals

Enable local repair with bounded whitelisted fields, masked credentials, backups and revisions. No legacy policy lookup, migration/state identity changes, provider writes, relaxed validation, raw YAML editor or credential disclosure.

## Decisions

- Parse a private read-only document for UI inspection independently of strict operational validation. Project only supported primitive profile/default/policy/limit fields, expose boolean credential presence and field-only diagnostics, and keep raw values on the server.
- Readable invalid configurations retain their credentials server-side. Malformed YAML offers a fresh draft with an explicit re-entry notice. Unsupported fields are excluded only during explicitly confirmed repair, and the exact original is backed up.
- Preserve valid-config editing behavior. Invalid-config profile changes remain in transient browser memory until one Apply repair action; unused draft profiles can be removed, mapping policies and advanced limits can be corrected. No drafts or credentials enter local storage/jobs/logs.
- Reuse the existing settings lease and atomic commit with reset/backup for invalid originals. Check revisions before mutation, require repair confirmation, validate the full candidate and return a relative backup path. Map atomic configuration races to HTTP 409.
- Migration/analysis forms do not offer operations while active configuration is invalid. Strict CLI/jobs validation remains the final boundary.
- Cover init templates, legacy policies, mixed invalid profiles, malformed YAML, stored secrets, failure/stale writes and browser repair using neutral fixtures; do not edit the user's real workspace.

## Risks / Trade-offs

Unsupported fields and comments in an invalid original are retained in the private backup rather than copied into a validated replacement; the UI explains this before confirmation. Drafts are transient and require explicit application. The original CLI init wizard retains its existing validated edit/reset semantics.

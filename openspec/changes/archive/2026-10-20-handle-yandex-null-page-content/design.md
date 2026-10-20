# Design

## Context

See `proposal.md` for motivation. The Yandex page-details endpoint has been observed returning a structurally valid Grid page with `page_type: grid`, `content: null`, and no active revision. The current runtime schema rejects null before the adapter can query Grid resources, so one provider-specific representation can abort a large subtree. Discovery errors are currently flattened into one string, which prevents the report from reconciling known identities and retryability.

## Goals / Non-Goals

**Goals:**

- Preserve strict runtime validation while accepting the documented-by-observation null Grid representation.
- Carry content availability explicitly through the provider-neutral page model.
- Resolve available Grid payloads to the existing lossless static-table adaptation and make unavailable payload visible and partial.
- Preserve enumerated page identities and structured failures when the discovery barrier must stop a run.

**Non-Goals:**

- Guessing or reconstructing Grid cells that the provider does not expose.
- Treating missing ordinary page content as empty or successful.
- Continuing destination writes after a genuinely incomplete selected inventory.
- Changing state identity, CLI flags, rate limits, or deletion behavior.

## Decisions

### Represent provider content availability separately from the body

`SourcePage` will carry optional provider-neutral content-availability metadata. A valid null Grid body becomes an empty transport string plus `provider-unavailable` metadata; ordinary missing content remains a contract error. This avoids making every renderer nullable and prevents the empty-page classifier from confusing unavailable content with a deliberate empty page.

Alternative: coerce every null to an empty string. Rejected because it would silently report unknown source data as a complete empty page.

### Resolve the availability marker during resource inventory

Normalization records the unresolved provider payload. The Grid-resource reconciliation step clears it when at least one complete Grid snapshot is available and emits the existing static-table adaptation. If no snapshot exists, it adds one safe fallback block linking to the original page plus one degradation notice. Renderers and verification then process the same explicit normalized document in every destination direction.

Alternative: render the fallback directly in the Yandex adapter. Rejected because it would mix source acquisition with destination representation and could incorrectly traverse the fallback link in `linked` scope.

### Preserve the pre-mutation inventory barrier with a typed error

The Yandex adapter will throw a typed incomplete-discovery error only for genuine hydration failures. It contains the enumerated selected identities, successfully hydrated details, projected report metadata, exclusions, and structured failure evidence. The migrator recognizes it, registers every known page, marks failures versus not-started outcomes, records per-page issues, and emits a compact run-level message. Other unexpected errors retain the generic failure path.

Alternative: continue transferring only successfully hydrated pages. Rejected because descendants could be written under an incorrect hierarchy and the requested subtree would no longer be complete.

### Derive retryability from typed provider evidence

Persistent `429`, `5xx`, timeout, DNS, connection, and TLS transport failures remain retryable; schema/contract failures and ordinary `4xx` responses are not. Diagnostic categorization uses the typed error and stable codes instead of parsing a combined message.

### Keep state and resume semantics unchanged

A provider-null Grid page is cached like any other selected page, including its availability metadata. A rerun can replace its fallback automatically if the provider later exposes Grid data. Genuine discovery failure writes only run/report evidence and performs no destination mutations, so the same state can be retried safely.

## Risks / Trade-offs

- [Yandex may introduce null content for another page type] → accept null only for the proven Grid case; future types require explicit evidence and tests.
- [A Grid endpoint can transiently hide data] → preserve a source link and partial status; reruns re-query resources and can become complete without a new mapping.
- [Slug-derived hierarchy for failed detail stubs may be incomplete] → mark metadata limitations in the report and never use stubs for destination planning.
- [Many failures can still produce many report rows] → keep per-page issues for actionability while keeping the terminal message bounded.

## Migration Plan

1. Add the nullable provider response and provider-neutral availability marker without changing persisted identity.
2. Add Grid reconciliation and fallback behavior with contract and rendering tests.
3. Add typed incomplete-discovery reporting and invariant tests for counts/outcomes/mutation barrier.
4. Existing states resume normally; no conversion or cleanup is required. Rollback restores the previous binary and leaves state/destination data untouched.

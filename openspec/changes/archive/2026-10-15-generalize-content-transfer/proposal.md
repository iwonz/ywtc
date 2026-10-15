## Why

ywtc is currently coupled to one Yandex Wiki source and one Confluence destination, which prevents bidirectional transfers, linked-page graph discovery, and portable exports. The public v2 contract should instead model providers and destinations explicitly while retaining resumability, auditability, and a strict no-silent-data-loss policy.

## What Changes

- **BREAKING** replace `--target` with `--destination` and `--single-page` with `--scope page|subtree|linked`.
- **BREAKING** replace the single-pair environment configuration and state v1 with named connection profiles and provider-neutral state v2.
- Add Yandex Wiki and Confluence source/destination adapters for all four remote transfer directions.
- Add deterministic transitive linked-page discovery with canonical identity, cycle handling, inaccessible/broken edge reporting, and hierarchy projection.
- Add Markdown and self-contained static HTML directory destinations with streamed attachments, optional ZIP archives, staged replacement, and recoverable backups.
- Introduce a normalized document model, provider-specific parsers/renderers, raw source snapshots for degraded constructs, and post-write verification.
- Replace custom CLI, queue, and rendering infrastructure where mature maintained libraries provide stronger validation, cancellation, rate limiting, and streaming.
- Generalize reports, documentation, package metadata, tests, and release notes for the new transfer matrix.
- Do not delete source or destination content, automatically adopt unrelated remote pages, execute source scripts, or silently discard unsupported content.

## Capabilities

### New Capabilities

- `static-export`: Markdown/HTML directory output, attachment layout, manifests, staged replacement, backups, and ZIP creation.

### Modified Capabilities

- `wiki-migration`: Generalize the migration engine to provider adapters, scope selection, graph discovery, normalized content, state v2, fidelity safeguards, and four remote directions.
- `workspace-management`: Add named non-secret connection profiles and generalized doctor/configuration behavior.
- `project-maintenance`: Update CLI/package dependencies, documentation, reports, testing, and public repository hygiene.
- `release-management`: Publish the breaking transfer model as the pending 2.0.0 release through existing trusted channels.

## Impact

The CLI contract, configuration schema, state schema, migration orchestrator, vendor clients, converters, reports, tests, README, package dependencies, and release metadata change. Existing v1 flags, single-pair configuration, and state files are diagnosed but not executed or upgraded automatically.

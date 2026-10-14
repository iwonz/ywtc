## Context

The CLI currently defaults every invocation to `.wiki-migration/state.json`. The state itself validates source slug, Confluence parent ID, and space key, so a second unrelated migration without `--state` fails rather than receiving isolated state. Conversely, users can accidentally choose arbitrary filenames for equivalent URL/slug/ID forms and lose automatic resume behavior. State also determines cache and report placement, so changing the default must keep report bundles in their established `.wiki-migration/reports` location.

Canonical page identity is only known after read-only API resolution. The solution therefore selects state after source and target preflight and before any Confluence mutation. Node.js 22 built-ins provide deterministic SHA-256 identifiers and atomic rename/write operations without another dependency.

## Goals / Non-Goals

**Goals:**

- Give every resolved source-target pair a deterministic, credential-free automatic state ID and path.
- Make equivalent supported input forms resume the same migration, while different tenants, instances, spaces, or pages remain isolated.
- Preserve compatible legacy default state and exact explicit `--state` behavior.
- Provide a recoverable `--fresh` mode and preserve dry-run's no-state-mutation guarantee.
- Keep cache and reports under a stable runtime root and make state decisions and failures understandable.

**Non-Goals:**

- Discover or adopt destination pages that were created without a known state mapping.
- Merge two arbitrary state files, delete Confluence content, or guarantee safe concurrent writes from two processes using the same state identity.
- Put credentials, authorization headers, or source content into state identifiers or report metadata.

## Decisions

### Canonical identity is based on resolved objects

After resolving the source root and target page, the migrator serializes a fixed-order tuple containing normalized Yandex API and web base URLs, organization type and ID, resolved source page ID, normalized Confluence base URL, resolved space key, and resolved target page ID. A SHA-256 digest truncated to 24 hexadecimal characters becomes the state ID. Inputs such as source slug versus source URL and target ID versus supported target URL therefore converge after API resolution.

Using parsed input strings directly was rejected because aliases and URL shapes would fragment state. Using source slug alone was rejected because slugs can change and identical slugs may exist in different organizations.

### Automatic paths are isolated from reports and caches

Automatic state is stored at `.wiki-migration/states/<id>.json`; runtime caches and report bundles remain `.wiki-migration/cache` and `.wiki-migration/reports`. For an explicit `--state`, its containing directory remains the runtime root for backward compatibility. Migration results and reports include non-secret state selection metadata.

### Legacy state is a read-only fallback seed

When automatic state is absent and `--fresh` is not active, the store attempts to load `.wiki-migration/state.json`. It resumes only when the legacy ownership tuple matches the resolved migration. Later live saves write atomically to the new automatic path, leaving the legacy file intact as recovery material. An unrelated valid legacy file is ignored; malformed or unreadable legacy state stops with guidance because ownership cannot be established safely.

Copying or renaming legacy state during selection was rejected because dry-run must not mutate state and a process interruption could otherwise remove the recovery source.

### Fresh runs rotate selected state before starting empty

`--fresh` always ignores mappings. A live run atomically renames an existing selected automatic or explicit state to a unique UTC timestamped backup before initializing empty state. A dry-run creates only empty in-memory state and performs no state backup or write. Automatic fresh mode also ignores legacy fallback. CLI output warns that existing destination pages cannot be adopted automatically and may be duplicated or receive stable suffixes.

Deleting old state was rejected as destructive. Treating fresh mode as permanently stateless was rejected because an interrupted fresh live run must itself be resumable.

### Errors name paths and safe recovery choices

Parsing, schema, ownership, read, backup, and write failures are wrapped with the affected path and concrete options: restore a backup, choose a matching `--state`, omit the override for automatic selection, fix permissions, or use `--fresh` to preserve and replace a selected file. Values derived from tokens are never included.

### Existing migration safety remains unchanged

Retry, rate limiting, title conflicts, content degradation, page/attachment mapping, and destination verification continue to use existing behavior. State selection happens before skeleton creation, and every live state update remains atomically serialized. The system still does not delete destination content or implicitly adopt unrelated pages.

## Risks / Trade-offs

- **[Same migration started concurrently]** → Atomic individual writes do not merge two in-memory processes; document that the same canonical migration must not run concurrently and make separate source-target pairs naturally isolated.
- **[Resolved source numeric IDs are unavailable or change across a vendor migration]** → API resolution failure stops before state selection; operators may use an explicit known state after correcting connectivity/configuration.
- **[Truncated digest collision]** → 96 bits makes accidental collision negligible, and state ownership validation still rejects a mismatched file before mutation.
- **[Fresh run creates duplicate destination content]** → Preserve state backups and display a prominent warning before mutations; never imply that fresh mode removes existing pages.
- **[Malformed legacy file blocks a new automatic run]** → Fail closed with the exact path and recovery instructions rather than risk duplicating a migration whose ownership cannot be checked.

## Migration Plan

1. Release automatic selection while retaining `--state` as an exact override.
2. On the first automatic run, seed from a matching legacy default and write subsequent updates to the hashed path.
3. Leave legacy and backup files untouched for manual recovery; users may remove them only after verifying the new state.
4. Rollback consists of invoking the earlier version with an explicit compatible state path; no destination migration or state schema conversion is required.

## Open Questions

None.

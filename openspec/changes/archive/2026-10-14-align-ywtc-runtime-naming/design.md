## Context

The package, binary, repository, and README already use `ywtc`, but the CLI heading remains generic and automatic runtime data is rooted at `.wiki-migration/`. Since automatic state was recently split by canonical source-target ID, existing installations can now have either an original `.wiki-migration/state.json` or a newer `.wiki-migration/states/<id>.json`. A direct root rename without fallback would make reruns lose mappings and could duplicate Confluence content.

## Goals / Non-Goals

**Goals:**

- Use `ywtc` consistently in current operator-facing product naming.
- Make `.states/` the only default write root for automatic state, cache, and reports.
- Resume safely from both known `.wiki-migration/` state layouts without modifying or deleting them.
- Keep both runtime roots excluded from lint traversal, Git, release checks, and publication.

**Non-Goals:**

- Rename the user's local checkout folder or GitHub repository URL.
- Rewrite archived OpenSpec history whose old labels describe historical changes rather than the current product.
- Move old reports/caches, merge state files, or delete `.wiki-migration/`.
- Change explicit `--state`, retry, content conversion, conflict resolution, or destination mutation behavior.

## Decisions

### State files live directly under `.states/`

Automatic state becomes `.states/<24-character-id>.json`; `.states/cache/` and `.states/reports/` retain clear resource namespaces. A mechanical root-only rename to `.states/states/<id>.json` was rejected because the doubled name is unnecessary and less readable.

### Fallback order is deterministic and read-only

When the new selected state does not exist and `--fresh` is false, lookup order is:

1. `.wiki-migration/states/<state-id>.json`, the prior automatic layout;
2. `.wiki-migration/state.json`, the original singleton layout.

Only matching ownership is adopted. The prior automatic path is identity-specific and a mismatch fails closed; the singleton may belong to another migration and is ignored when valid but unmatched. Once adopted, a live preflight atomically writes the same state to `.states/<id>.json`; dry-run does not write. Old files are never renamed or deleted.

### Compatibility roots are explicit metadata

State path resolution returns ordered fallback descriptors with mismatch policy rather than one ambiguous legacy filename. CLI/report metadata continues to show the actual loaded path, so operators can see when an old layout was adopted.

### Repository hygiene protects both roots

`.states/` is added to `.gitignore`, Biome exclusions, AGENTS guidance, and release checks. `.wiki-migration/` remains ignored and blocked from tracking because it may contain sensitive historical reports and downloaded content. Public docs call it a previous location only in migration guidance.

### Product naming does not erase functional terminology

CLI help leads with `ywtc`. Functional descriptions may still say “Yandex Wiki to Confluence” and the OpenSpec capability `wiki-migration` remains stable because those identify purpose/capability rather than an obsolete product name. Archived proposal names are immutable historical records.

## Risks / Trade-offs

- **[Two valid old states exist]** → Prefer the identity-specific hashed state before the singleton and report the loaded path.
- **[Old state is malformed]** → Fail with the existing actionable state error rather than silently start empty and risk duplicates.
- **[Old cache is not reused]** → Downloads may repeat once after upgrade, but state mappings remain safe and old cache data stays untouched.
- **[Users mistake `.states/` for source data]** → Keep it hidden, documented as runtime-only, ignored, and excluded from package/release scanning.

## Migration Plan

1. Ship `.states/` as the new default and keep both old ignore protections.
2. On first live rerun, load the first matching old state and atomically persist it to the new path before Confluence mutations.
3. Leave `.wiki-migration/` for manual recovery; operators can remove it only after validating the new state and retaining any desired reports.
4. Rollback uses an explicit `--state` pointing at either compatible file; the JSON schema does not change.

## Open Questions

None.

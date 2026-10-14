## Context

The v1 CLI is a source-checkout command that loads `.env` from the process directory and talks only to Confluence Data Center. State isolation, content conversion, retries, reports, and non-destructive reruns already exist and must remain stable. Version 2 turns the codebase into a public installable tool while adding Confluence Cloud and making runtime ownership explicit through a selected workdir.

The migration APIs differ substantially: Data Center exposes the established `/rest/api` content model and Bearer PATs, while Cloud uses REST v2 for page/space operations, REST v1 for multipart attachments, and Basic email/API-token authentication. Yandex Wiki is a hosted Public API v1 whose additive fields should not break migrations, but malformed required structures must fail clearly.

## Goals / Non-Goals

**Goals:**

- Provide explicit, discoverable v2 commands and deterministic workdir behavior.
- Support Data Center 7.9+ and Cloud through normalized adapters and read-only capabilities.
- Preserve Data Center state identity and all current retry, resume, conflict, fidelity, reporting, and no-delete guarantees.
- Ship verified npm/npx, GitHub, and Homebrew channels without long-lived npm secrets.
- Make failures actionable before mutation and keep all runtime data out of the repository/package.

**Non-Goals:**

- Confluence Server, Basic Auth for Data Center, Cloud OAuth app lifecycle, or vendor-specific plugins.
- Migration of version history, comments, users, permissions, watchers, or deletion/synchronization of removed destination content.
- Live certification of every Confluence patch release; compatibility is capability- and contract-based.
- Self-modification when invoked through npx, a local dependency, or a source checkout.

## Decisions

### Command parser and dispatch

Use Node's `parseArgs` with a small explicit command discriminator rather than introduce a command-framework dependency. Global `--help` and `--version` short-circuit before workspace/config access. Each command parses only its supported flags and emits a command-specific error. The prior direct `--source/--target` form is rejected because a compatibility shim would obscure the v2 boundary.

### Workspace boundary

Represent a workspace as an absolute root plus marker, environment file, and `.states` paths. Selection is explicit argument, marked CWD, or home default. `init` uses exclusive/idempotent filesystem operations and writes an empty template with mode `0600`; `.states` uses `0700` where supported. Existing artifacts are never replaced. Relative explicit state paths are resolved then checked with `path.relative` to prevent escaping the workdir.

Configuration is formed from parsed workdir `.env` followed by process environment overlay. This avoids dotenv's global mutation and makes precedence testable. Validation returns structured issues so CLI errors identify names, conditions, and the file to edit without echoing values.

### Common Confluence interface with two adapters

Keep the migrator dependent on the normalized `ConfluenceApi` interface. A factory selects:

- Data Center adapter: context-path-aware `/rest/api`, Bearer PAT, server information/version parsing, v1 content/storage and attachment operations.
- Cloud adapter: site URL normalized to `/wiki`, Basic email/API-token auth, `/api/v2/pages` and `/api/v2/spaces`, plus `/rest/api/content/{id}/child/attachment` for uploads.

Both adapters normalize page ID, title, storage body, version, space key/ID, ancestors, web link, and operations. The Cloud adapter translates create/update payloads at its boundary. This preserves conversion and migration orchestration and localizes vendor drift.

Preflight first attempts identity/version discovery and read contracts, resolves the target, then performs non-mutating capability probes. Some Data Center deployments do not expose `settings/systemInfo` to ordinary users; `403`/`404` from that optional endpoint falls back to the content/storage route actually used by migration rather than blocking a capable server. It distinguishes authentication, authorization, target not found, conflicts, payload limits, throttling, schema drift, and unsupported required capabilities. Data Center rejects a known version below 7.9 but has no maximum; unavailable/unknown/newer versions proceed only when required contracts pass.

### Yandex tolerant schemas

Use Zod schemas with passthrough objects and unions for observed envelope variations. Required normalized fields are strict enough for migration, unknown fields are retained/ignored, and failures include the operation name plus sanitized issue paths. Authorization headers and response secrets are never rendered. Retries, service-wide 429 cooldowns, and operation concurrency remain in the shared HTTP/rate-limit layers.

### Deployment-aware state

Continue hashing the current canonical Data Center fields in their existing order so current `.states` files resolve unchanged after `init --workdir .`. Add a deployment discriminator and Cloud space ID only for Cloud identity. State/report/cache paths derive from the workspace `.states`, while explicit paths remain exact after safe workdir resolution. Each mutation is atomically persisted; conflicts and reruns update mapped objects, and nothing deletes destination data.

### Update command

Detect source checkout, npx cache, local `node_modules`, global npm, and Homebrew from executable/module paths plus optional explicit `--via`. Retrieve latest version from the npm registry with the normal bounded HTTP timeout. Without `--install`, print status and command. With installation, spawn fixed executables with argument arrays and `shell: false`; source/npx/local modes remain advisory. Tests inject spawn and registry functions.

### Distribution and releases

Rename metadata to `@iwonz/ywtc`, enable public scoped publication, and validate `npm pack` by isolated prefix installation. Release Please keeps only product-bearing commit types release-triggering while changelog sections cover feature, fix, performance, revert, docs, refactor, test, build, CI, chore, and style commits. Commitlint validates PR/push ranges and rejects generic/WIP subjects.

The release workflow uses its Release Please output to run checks, publish through npm OIDC/provenance, upload the exact tarball/checksum, and amend GitHub notes with verified commands. A dependent macOS job downloads the registry archive, generates `Formula/ywtc.rb`, validates it with Homebrew, synchronizes `master`, commits the formula, and pushes without force. The same-repository tap requires the explicit repository URL once; normal upgrades then use Homebrew.

Before the first v2 release, the owner publishes only `0.0.0` with tag `bootstrap` and interactive 2FA, then binds npm trust to the already-pushed `release.yml`. No OTP, npm token, or auth file enters Git or logs.

### Header asset and documentation

Edit the existing raster cover with ImageGen into a restrained dark editorial technical diagram. Preserve the wide composition while making Yandex Wiki, the `ywtc` pipeline, and Confluence immediately legible; avoid faux UI, excess neon, fine illegible labels, and decorative clutter. Inspect the generated file before replacing the tracked asset.

README becomes an operator-first reference: install, init, configure, doctor, dry-run/migrate, compatibility, parameters, state/reports, update, v1 migration, and release/development flow. One canonical table owns each parameter set to avoid duplication.

## Risks / Trade-offs

- [Cloud and future Data Center schemas drift] → Validate normalized required fields at runtime, tolerate additive fields, maintain mocked profiles, and stop on failed capability probes before writes.
- [Capability probes cannot prove all permissions without mutation] → Clearly label read-only preflight limits; rely on target operations and precise first-write errors without deleting partial output.
- [Existing Data Center state stops resolving] → Preserve the current hash inputs exactly for Data Center and add regression fixtures.
- [Automatic initialization surprises users] → Create only local scaffolding, print every selected path, and never issue API calls until configuration validates.
- [Update command changes the wrong installation] → Default to check-only, refuse unsafe channels, use fixed argv arrays without shell, and allow explicit `--via` only when detection supports it.
- [Release job partially succeeds] → Make npm publication idempotent by checking the registry, use clobber-safe GitHub assets, and keep formula publication in a dependent repairable job.
- [Same-repository Homebrew tap is less conventional] → Document the explicit tap URL and test the exact two-command setup on macOS.
- [Generated image contains inaccurate text/logos] → Use the existing cover as edit target, constrain text, visually inspect at original resolution, and iterate once if needed.

## Migration Plan

1. Land one audited `feat!` implementation commit after OpenSpec archival and full checks.
2. Push `master`; verify Release Please proposes exactly `2.0.0` and only approved release metadata.
3. Publish the minimal `0.0.0` bootstrap under dist-tag `bootstrap` with owner 2FA if the npm scope package is still absent.
4. Configure npm trusted publishing for `iwonz/ywtc` and `.github/workflows/release.yml` with publication enabled.
5. Merge the release PR; verify OIDC publication, provenance, GitHub tag/release/assets/notes, and the formula bot commit.
6. Verify clean npm global, npx, and Homebrew installations plus a read-only Data Center dry-run from an ignored workspace.

Rollback is non-destructive: do not unpublish npm or delete releases; patch forward. If formula publication fails, rerun only its idempotent job after fixing the generator. Existing destination content and state are never removed.

## Open Questions

None. Interactive npm 2FA remains an explicit owner checkpoint during the real publication stage.

## 1. CLI and workspace

- [x] 1.1 Implement explicit v2 command parsing, command-specific help, and version output while rejecting the legacy direct invocation
- [x] 1.2 Implement workdir precedence, safe path expansion, idempotent initialization, permissions, and workdir-bound state resolution
- [x] 1.3 Refactor configuration loading for workdir `.env`, process precedence, deployment/auth profiles, and actionable structured errors
- [x] 1.4 Implement `doctor` configuration and read-only capability modes with tests
- [x] 1.5 Implement safe `update` detection/check/install behavior using injected no-shell subprocesses with tests

## 2. Vendor compatibility

- [x] 2.1 Define the normalized Confluence interface/factory and refactor the Data Center adapter with server-version/capability preflight
- [x] 2.2 Implement the Confluence Cloud page/space REST v2 and attachment REST v1 adapter with Basic email/API-token auth
- [x] 2.3 Add tolerant runtime schemas and diagnostics for Yandex Wiki Public API v1 pages, descendants, resources, and Grid responses
- [x] 2.4 Preserve Data Center canonical state identity, add Cloud deployment/space identity, and scope automatic runtime paths to workdir
- [x] 2.5 Add mock contract coverage for Data Center 7.9/8.9/9/10/11, Cloud, auth, URL forms, pagination, storage, attachments, status errors, and schema drift

## 3. Packaging and release automation

- [x] 3.1 Convert metadata to public `@iwonz/ywtc`, include runtime assets, and verify packed/global/npx-style installation in isolation
- [x] 3.2 Add Commitlint configuration and CI range validation for all maintainer and bot commits, including generic/WIP rejection
- [x] 3.3 Configure Release Please sections so all meaningful types appear while only product types/breaking changes affect SemVer
- [x] 3.4 Extend release workflow for npm OIDC provenance, idempotent GitHub artifacts/notes, and Node 22/24/current checks
- [x] 3.5 Add deterministic Homebrew formula generation plus macOS style/audit/install/function validation and verified direct formula commit
- [x] 3.6 Add tests for package hygiene, release behavior, formula generation, bootstrap/trust metadata, and secret/runtime exclusion

## 4. Documentation and branding

- [x] 4.1 Update AGENTS.md with clean-master fetch/pull and pre-commit origin synchronization rules
- [x] 4.2 Rewrite README for v2 installation, workdirs, commands, parameter tables, compatibility, credentials, state, update, migration, and releases
- [x] 4.3 Edit the README cover with ImageGen into the approved restrained dark technical pipeline and visually verify the tracked image
- [x] 4.4 Update the safe environment template and public migration/release guidance without repository-specific runtime data

## 5. Verification and delivery

- [x] 5.1 Run focused tests, package installation smoke tests, and `npm run check`; resolve all failures without weakening gates
- [x] 5.2 Complete task statuses, archive `ship-ywtc-v2`, and run strict validation with no active OpenSpec changes
- [x] 5.3 Verify the pre-commit synchronization procedure, breaking Conventional Commit message, and non-force push plan
- [x] 5.4 Verify Release Please `2.0.0`, npm bootstrap/trust, OIDC publication, and release-repair automation are complete and documented
- [x] 5.5 Complete local npm/global-style installation and real read-only Data Center dry-run acceptance, and verify post-release npm/npx/Homebrew checks are automated

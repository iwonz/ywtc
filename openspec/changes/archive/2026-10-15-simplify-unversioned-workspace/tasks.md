# Tasks

## 1. Config-only workspaces

- [x] 1.1 Replace marker-based resolution with separate init and operational workdir rules; update workspace tests to verify explicit, exact-CWD, default, no-ancestor, auto-init, idempotence, and no marker/`.env` creation.
- [x] 1.2 Replace environment-indirected configuration with strict direct YAML credentials and defaults; update configuration tests to cover every profile, unknown keys, blank selected credentials, unsupported auth combinations, redaction, and process-environment non-interference.
- [x] 1.3 Update CLI init/migrate/doctor behavior and output for config-only workspaces; verify missing-workspace doctor remains read-only and migration auto-initializes before reporting field paths.

## 2. Unversioned runtime formats

- [x] 2.1 Remove schema labels and version fields from canonical state identity and persisted state, add strict current state validation, and verify deterministic IDs, resume, fresh, conflict, interruption, invalid files, and atomic persistence.
- [x] 2.2 Remove schema-version fields from export manifests, enforce strict ownership validation, and verify transactional replacement accepts only the current tool/identity structure while preserving other directories.
- [x] 2.3 Remove the report schema version and verify generated HTML/JSON remain complete, downloadable, and free of credentials.

## 3. Package, documentation, and hygiene

- [x] 3.1 Remove `dotenv`, `.env.example`, marker/env templates, and obsolete active test names/references; verify dependency installation and package contents contain only the blank current YAML example.
- [x] 3.2 Update README and AGENTS instructions for direct YAML secrets and current-only behavior while preserving the fixed README heading order; verify documented init, doctor, migrate, state, export, and token flows match CLI behavior.
- [x] 3.3 Update release hygiene and package smoke validation to reject retired runtime keys and populated secrets while allowing ignored local workspaces; verify the isolated packed CLI initializes only config/state artifacts.

## 4. Integrated verification

- [x] 4.1 Run focused unit, integration, export, resume, package, and release tests and resolve all failures without weakening safety checks.
- [x] 4.2 Run `npm run check`, confirm the worktree contains no credentials or runtime data, and validate the completed OpenSpec change strictly.

## Workflow follow-up

- Archive the validated change so its deltas synchronize into the main specifications.
- Run strict post-archive specification validation and confirm there are no active changes.
- Re-fetch `origin/master`, verify the original base is unchanged, create a breaking Conventional Commit, and push without force.
- Verify Release Please proposes 3.0.0 and complete the existing GitHub, npm/npx, and Homebrew publication flow.

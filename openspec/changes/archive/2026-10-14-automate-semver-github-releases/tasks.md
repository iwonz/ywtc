## 1. Release metadata and validation

- [x] 1.1 Add Release Please configuration, the `1.0.0` manifest baseline, and an initial changelog.
- [x] 1.2 Implement strict SemVer release-tag validation for package, lockfile, manifest, changelog, and prior tag ordering.
- [x] 1.3 Add unit tests for valid stable/prerelease versions, invalid versions, ordering, and metadata mismatches.

## 2. GitHub automation

- [x] 2.1 Add a least-privilege GitHub Actions workflow for pull-request checks, `master` release proposals, Release Please publication, and validated manual tag publication.
- [x] 2.2 Package each published release as an npm archive with a SHA-256 checksum and support idempotent artifact repair.

## 3. Maintainer guidance

- [x] 3.1 Document the SemVer mapping, release pull-request lifecycle, initial bootstrap, GitHub settings, artifacts, recovery, and GitHub-only distribution in README.
- [x] 3.2 Add Conventional Commit and generated release-metadata rules to AGENTS without weakening the OpenSpec lifecycle for substantive changes.

## 4. Verification and completion

- [x] 4.1 Run focused validator/workflow checks and `npm run check`, fixing every failure without weakening checks.
- [x] 4.2 Archive the OpenSpec change, run strict validation, and confirm no active change remains.

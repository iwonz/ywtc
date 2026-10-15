## 1. Cooldown-compatible dependency graph

- [x] 1.1 Pin `@diplodoc/transform` to `4.78.6` and `dotenv` to `18.0.7`, then update the lockfile.
- [x] 1.2 Add release regression coverage for both exact cooldown-eligible runtime dependencies.

## 2. Validation and release readiness

- [x] 2.1 Verify the dependency graph with `--min-release-age=1` and run the complete project quality gate.
- [x] 2.2 Archive the OpenSpec change and strictly validate all specifications.

## 1. Scope implementation

- [x] 1.1 Add and wire the `--single-page` boolean CLI option through migration options and terminal startup output.
- [x] 1.2 Skip descendant discovery and stale-descendant reporting while preserving selected-page resources, links, state reuse, and default subtree behavior.

## 2. Coverage and documentation

- [x] 2.1 Add integration and progress tests for the single-page scope, including no descendant request and no descendant mutation.
- [x] 2.2 Document the new option in CLI help, the README parameter table, and a runnable example.

## 3. Validation and completion

- [x] 3.1 Run the complete project quality gate and verify the public package contents.
- [x] 3.2 Sync the wiki-migration specification, archive the change, and run strict OpenSpec validation.

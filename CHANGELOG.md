# Changelog

Notable changes to `ywtc` are documented in this file. Versions follow [Semantic Versioning](https://semver.org/).

## [2.0.0](https://github.com/iwonz/ywtc/compare/v1.0.0...v2.0.0) (2026-10-15)


### ⚠ BREAKING CHANGES

* use --destination, --scope, and state v2; require Node.js 24 and npm 11.5.1.
* migration now requires the migrate subcommand and explicit deployment settings.

### Features

* generalize content transfer and static export ([a707f26](https://github.com/iwonz/ywtc/commit/a707f2670831c6c20277780bf02c651f920fbd28))
* ship ywtc v2 workspace and distribution ([1c4c8bd](https://github.com/iwonz/ywtc/commit/1c4c8bd9dc43ca1e0e36d6690019dae34b7dcfc8))


### Documentation

* clarify migration quick start ([d09a306](https://github.com/iwonz/ywtc/commit/d09a306637367592842d0653d0a382e46a774fbe))
* document first npm release bootstrap ([0496ccb](https://github.com/iwonz/ywtc/commit/0496ccbc1ac82c97ca0f80a75ce082ee1ffbb7ad))
* simplify README cover framing ([708e0ac](https://github.com/iwonz/ywtc/commit/708e0ac7da6d063532962e61ba3e58c9b5993a5d))


### Continuous Integration

* refresh GitHub Actions runtimes ([a6c33be](https://github.com/iwonz/ywtc/commit/a6c33be725ca2f5803e0cf7bd5277588f52b4afb))

## [1.0.0] - 2026-10-14

### Added

- Resumable migration of Yandex Wiki page trees to Confluence Data Center.
- YFM conversion, internal-link rewriting, attachments, images, tables, dynamic-grid snapshots, and readable degradation fallbacks.
- Automatic per-migration state, single-page mode, dry-run, rate controls, terminal progress, and HTML/JSON reports.
- Public documentation, release hygiene, Biome, Knip, tests, and the mandatory OpenSpec workflow.

[1.0.0]: https://github.com/iwonz/ywtc/releases/tag/v1.0.0

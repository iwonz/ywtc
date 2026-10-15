# Changelog

Notable changes to `ywtc` are documented in this file. Versions follow [Semantic Versioning](https://semver.org/).

## [2.0.1](https://github.com/iwonz/ywtc/compare/v2.0.0...v2.0.1) (2026-10-15)


### Bug Fixes

* **homebrew:** audit formula through temporary tap ([36062c4](https://github.com/iwonz/ywtc/commit/36062c4d802d2ed8294d877e5b88c05bf3f6fe73))
* **homebrew:** generate canonical npm formula ([76230ae](https://github.com/iwonz/ywtc/commit/76230ae879fda3d8d336d812dbc96adf50a1c11e))
* **homebrew:** honor dependency release cooldown ([cab4bc0](https://github.com/iwonz/ywtc/commit/cab4bc0a66b1ba9582c416c44830d8d133725c52))
* **homebrew:** infer version from registry URL ([327bdd1](https://github.com/iwonz/ywtc/commit/327bdd1dd2147a95c8703ab8a4bd36475955dc95))
* **release:** recover npm and Homebrew publication ([f91cb4e](https://github.com/iwonz/ywtc/commit/f91cb4e2c14359a0b47b1b601808a92c6f2ec6e5))
* **release:** run Homebrew after manual recovery ([b7bc73b](https://github.com/iwonz/ywtc/commit/b7bc73b35382ba1ad1cd5d808af4168b83fd8217))


### Maintenance

* **release:** retry publication checks ([67cdbde](https://github.com/iwonz/ywtc/commit/67cdbdeb8e4c6c64b45e8b3127f71e6526dcfa70))

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

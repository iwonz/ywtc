# Changelog

Notable changes to `ywtc` are documented in this file. Versions follow [Semantic Versioning](https://semver.org/).

## [5.0.0](https://github.com/iwonz/ywtc/compare/v4.4.0...v5.0.0) (2026-10-26)


### ⚠ BREAKING CHANGES

* **mentions:** mention policies accept only off or mapping with mappingFile.

### Features

* **mentions:** require explicit mention decision mappings ([7eb9943](https://github.com/iwonz/ywtc/commit/7eb9943637dd7143aa3954137c1607b9d2eaac96))


### Maintenance

* **homebrew:** update formula to v4.4.0 ([eb6929f](https://github.com/iwonz/ywtc/commit/eb6929ff891412c79348d648075943ac01d478e0))

## [4.4.0](https://github.com/iwonz/ywtc/compare/v4.3.1...v4.4.0) (2026-10-23)


### Features

* **migration:** rewrite mapped pages without replacement ([941a8bf](https://github.com/iwonz/ywtc/commit/941a8bfc619f9653cf4164fabe732cdcd3a4c606))


### Maintenance

* **homebrew:** update formula to v4.3.1 ([6fbd592](https://github.com/iwonz/ywtc/commit/6fbd592b0f7aed8ee88a08793511db207ec91ca3))

## [4.3.1](https://github.com/iwonz/ywtc/compare/v4.3.0...v4.3.1) (2026-10-23)


### Bug Fixes

* **cli:** group transfer completion summary ([30f931e](https://github.com/iwonz/ywtc/commit/30f931eab20b9786da40190c13f547af947cd194))


### Maintenance

* **homebrew:** update formula to v4.3.0 ([f938666](https://github.com/iwonz/ywtc/commit/f938666a2ed0fa76b105f1dc1a6a5cf58779b321))

## [4.3.0](https://github.com/iwonz/ywtc/compare/v4.2.4...v4.3.0) (2026-10-22)


### Features

* **migration:** configure mention transfer ([5bd6ce8](https://github.com/iwonz/ywtc/commit/5bd6ce82a00d88fe11a423ffb64d46d2511e55c1))
* **migration:** preserve diagrams and resume large assets ([d3bdc19](https://github.com/iwonz/ywtc/commit/d3bdc195db242322d6aa5ae633dafe35deaf23f8))


### Bug Fixes

* **ci:** install Playwright Chromium before checks ([e539bab](https://github.com/iwonz/ywtc/commit/e539babf414c9dbcb21f4b748e254c2efc6d7833))
* **migration:** harden large migration correctness ([a5e6bba](https://github.com/iwonz/ywtc/commit/a5e6bba82ffae93441be4ab39a761bc77e69b041))


### Documentation

* define status conditions and consolidate maintenance contracts ([c1c74e5](https://github.com/iwonz/ywtc/commit/c1c74e5e314c4f47157ae4c762c7cb16bdec3cf3))


### Maintenance

* **homebrew:** update formula to v4.2.4 ([98d1f51](https://github.com/iwonz/ywtc/commit/98d1f51057a1e2a76c57e584eadb8e7f241ec729))
* **release:** retry after commitlint failure ([c18f895](https://github.com/iwonz/ywtc/commit/c18f89577efe039039bdfd212cb735e47ee48e99))

## [4.2.4](https://github.com/iwonz/ywtc/compare/v4.2.3...v4.2.4) (2026-10-22)


### Bug Fixes

* **migration:** bound pathological YFM payloads ([47f4bf4](https://github.com/iwonz/ywtc/commit/47f4bf4b267ddafe7ed1a20b78906431c8c4a9fd))


### Continuous Integration

* **release:** rerun checks after metadata validation ([23973f2](https://github.com/iwonz/ywtc/commit/23973f23db36f50fccfcd047bec09a99289f25a3))


### Maintenance

* **homebrew:** update formula to v4.2.3 ([a843a98](https://github.com/iwonz/ywtc/commit/a843a98079c301c91b24fe9d09fd92cfa9185140))

## [4.2.3](https://github.com/iwonz/ywtc/compare/v4.2.2...v4.2.3) (2026-10-22)


### Bug Fixes

* **cli:** keep large transfer progress responsive ([2a82985](https://github.com/iwonz/ywtc/commit/2a82985a73c653b59f43df26638c2b8a82bd9e03))


### Continuous Integration

* **release:** rerun checks after commit metadata repair ([3f3596e](https://github.com/iwonz/ywtc/commit/3f3596e8fdd473a9687cafa0021139be1de89e20))


### Maintenance

* **homebrew:** update formula to v4.2.2 ([a792535](https://github.com/iwonz/ywtc/commit/a792535d8946951e24f3ee877dbfdeaa300055c3))

## [4.2.2](https://github.com/iwonz/ywtc/compare/v4.2.1...v4.2.2) (2026-10-22)


### Bug Fixes

* **cli:** keep long transfers visibly active ([ce7bc42](https://github.com/iwonz/ywtc/commit/ce7bc422038f3256644f13f58513e98719059f5e))


### Maintenance

* **homebrew:** update formula to v4.2.1 ([c251bc1](https://github.com/iwonz/ywtc/commit/c251bc15f47c65c06e63b3334b35f5c27f418a2c))

## [4.2.1](https://github.com/iwonz/ywtc/compare/v4.2.0...v4.2.1) (2026-10-22)


### Bug Fixes

* **migration:** isolate retryable Grid inventory failures ([6d8c4de](https://github.com/iwonz/ywtc/commit/6d8c4def058b0a8348c7f3c6a7f09b75aa9aa7d1))


### Maintenance

* **homebrew:** update formula to v4.2.0 ([c826cf7](https://github.com/iwonz/ywtc/commit/c826cf79a39b67d98274600595c496ef547bd033))
* **release:** retry after commitlint failure ([020f38c](https://github.com/iwonz/ywtc/commit/020f38cf5f5da1564db00b5bb1eeab1ed3fb8437))

## [4.2.0](https://github.com/iwonz/ywtc/compare/v4.1.6...v4.2.0) (2026-10-21)


### Features

* **retry:** rerun unresolved migration outcomes ([62d8285](https://github.com/iwonz/ywtc/commit/62d82857361eb0d5bebc882667dee750959004ad))


### Maintenance

* **homebrew:** update formula to v4.1.6 ([5bd3e08](https://github.com/iwonz/ywtc/commit/5bd3e087d46b7ec3a7322439c0d3887582d7211a))

## [4.1.6](https://github.com/iwonz/ywtc/compare/v4.1.5...v4.1.6) (2026-10-21)


### Bug Fixes

* **migration:** resume large source inventories ([c1aa449](https://github.com/iwonz/ywtc/commit/c1aa449bb5e4d85d7a5378cf1100197a66b369d3))


### Maintenance

* **homebrew:** update formula to v4.1.5 ([c5c4f59](https://github.com/iwonz/ywtc/commit/c5c4f599dd352480d9d3f74a47123230fa989b9b))
* **release:** retry after commitlint failure ([0a13962](https://github.com/iwonz/ywtc/commit/0a1396204a5fb0d40c9cc30c27c6a2c32836b21a))

## [4.1.5](https://github.com/iwonz/ywtc/compare/v4.1.4...v4.1.5) (2026-10-21)


### Bug Fixes

* **migration:** stabilize destination content verification ([04b4018](https://github.com/iwonz/ywtc/commit/04b4018cf3f8bc80d6f5805414d6e15ac40022b0))


### Maintenance

* **homebrew:** update formula to v4.1.4 ([128faaf](https://github.com/iwonz/ywtc/commit/128faafa33b37e016bf2a6f4b4f12f0a74c32cde))

## [4.1.4](https://github.com/iwonz/ywtc/compare/v4.1.3...v4.1.4) (2026-10-20)


### Bug Fixes

* **migration:** handle unavailable Yandex grid content ([6963068](https://github.com/iwonz/ywtc/commit/6963068e01402e2da06c9b2769177682e8e926e2))


### Maintenance

* **homebrew:** update formula to v4.1.3 ([e416bc2](https://github.com/iwonz/ywtc/commit/e416bc2b40a696194c64ef695861dbcc000cc43f))
* **release:** retry validation after commitlint failure ([abbaca6](https://github.com/iwonz/ywtc/commit/abbaca668e3585db6cb2eb3c180f8042ee19789a))

## [4.1.3](https://github.com/iwonz/ywtc/compare/v4.1.2...v4.1.3) (2026-10-19)


### Bug Fixes

* **migration:** harden checkpoints and verification ([240df83](https://github.com/iwonz/ywtc/commit/240df83b5592dffd116eda7f3f711fcf1dce881b))


### Maintenance

* **homebrew:** update formula to v4.1.2 ([821f532](https://github.com/iwonz/ywtc/commit/821f532ea829d4955aba150cb4499bc04def5e7d))
* **release:** retry validation pipeline ([3fb8688](https://github.com/iwonz/ywtc/commit/3fb86884a948f962f09a6918d63243b83f6c8114))

## [4.1.2](https://github.com/iwonz/ywtc/compare/v4.1.1...v4.1.2) (2026-10-16)


### Bug Fixes

* **confluence:** validate provider readiness responses ([1a6b32e](https://github.com/iwonz/ywtc/commit/1a6b32ed25c32bd13eca5ad78ab209e02f07ffbf))


### Documentation

* **readme:** simplify operator documentation ([cd745e7](https://github.com/iwonz/ywtc/commit/cd745e74662cd2bd4a5edc592994e39559fab81c))


### Maintenance

* **ci:** re-run documentation checks ([92d2504](https://github.com/iwonz/ywtc/commit/92d2504912123828429794913edc3b9703cb403e))
* **homebrew:** update formula to v4.1.1 ([6ef4a77](https://github.com/iwonz/ywtc/commit/6ef4a77b01f2730775b0e5a0ed6e22e8fe638e31))

## [4.1.1](https://github.com/iwonz/ywtc/compare/v4.1.0...v4.1.1) (2026-10-16)


### Bug Fixes

* **reports:** streamline report presentation and documentation ([0e9d14d](https://github.com/iwonz/ywtc/commit/0e9d14dd3e6c89380fd4c86aeb5193c1a7f3792a))


### Maintenance

* **homebrew:** update formula to v4.1.0 ([f56cd34](https://github.com/iwonz/ywtc/commit/f56cd347eda1e682a8668a093188a4069e7ec5a8))

## [4.1.0](https://github.com/iwonz/ywtc/compare/v4.0.1...v4.1.0) (2026-10-16)


### Features

* **cli:** add interactive migration wizard ([b185d42](https://github.com/iwonz/ywtc/commit/b185d421ec1ed46643a9e0d899a4d8c47e259bd5))
* **reports:** replace report UI with Mantine ([8ca093d](https://github.com/iwonz/ywtc/commit/8ca093de620fdfb762a6946a04ee868c14a11b0f))


### Maintenance

* **homebrew:** update formula to v4.0.1 ([e3d7aa6](https://github.com/iwonz/ywtc/commit/e3d7aa6450d78c23fbab33b6ba14d96baf919f81))
* **release:** retry validated release workflow ([b1fca35](https://github.com/iwonz/ywtc/commit/b1fca35926dccb8616d04d4b5901263f99f2ec74))

## [4.0.1](https://github.com/iwonz/ywtc/compare/v4.0.0...v4.0.1) (2026-10-16)


### Bug Fixes

* **migration:** distinguish adaptations from incomplete transfers ([63077c3](https://github.com/iwonz/ywtc/commit/63077c32e8f5515ad2fc12389a3f0d232f08a24a))


### Maintenance

* **homebrew:** update formula to v4.0.0 ([dc3b41c](https://github.com/iwonz/ywtc/commit/dc3b41cce1da2e14a05e1513b786df5ff132f9b2))
* **release:** retry automated release workflow ([0b5471a](https://github.com/iwonz/ywtc/commit/0b5471a80a49d4f09917b6ffb87a4bf39c708f8a))

## [4.0.0](https://github.com/iwonz/ywtc/compare/v3.6.0...v4.0.0) (2026-10-16)


### ⚠ BREAKING CHANGES

* destination pages and comment archives proven by state mappings are overwritten from source on rerun instead of preserving destination edits as content conflicts.

### Features

* make mapped destination updates source-authoritative ([b33cc0b](https://github.com/iwonz/ywtc/commit/b33cc0b0fe6f97a5a9d4d2e65f7497e1cf2a9efb))


### Maintenance

* **homebrew:** update formula to v3.6.0 ([5ffe5e5](https://github.com/iwonz/ywtc/commit/5ffe5e5366e423e5007feef9fc3cb9517a084464))
* **release:** retry automated release workflow ([a1fae54](https://github.com/iwonz/ywtc/commit/a1fae5448518bbb078d9656e2e438c3e9eec9f2e))

## [3.6.0](https://github.com/iwonz/ywtc/compare/v3.5.0...v3.6.0) (2026-10-16)


### Features

* **migration:** preserve empty pages and native layouts ([e11185e](https://github.com/iwonz/ywtc/commit/e11185ee0fa81b26e39ceebbd49f6aee7ae22cd8))


### Maintenance

* **homebrew:** update formula to v3.5.0 ([6d98178](https://github.com/iwonz/ywtc/commit/6d9817809008283cbd797640825a1fe676d1ddae))
* **release:** continue semantic layout publication ([4e9119a](https://github.com/iwonz/ywtc/commit/4e9119a5078b42c463a0d990b66508495083a012))
* **release:** publish semantic layout support ([84c34b8](https://github.com/iwonz/ywtc/commit/84c34b84216454f653ce00e26b756db3c1c3f311))

## [3.5.0](https://github.com/iwonz/ywtc/compare/v3.4.1...v3.5.0) (2026-10-16)


### Features

* **reports:** add interactive migration dashboard ([466b444](https://github.com/iwonz/ywtc/commit/466b444ef1b54d3d2f83da6c43e52fc967e9dd05))


### Bug Fixes

* **reports:** embed deterministic report fonts ([6bdfb1b](https://github.com/iwonz/ywtc/commit/6bdfb1b62b3dd869ebde578c6a0fa30739835ec0))


### Tests

* **reports:** normalize visual snapshot canvas ([c186e41](https://github.com/iwonz/ywtc/commit/c186e419ebe861c389c680e2baa7f79434216663))


### Maintenance

* **homebrew:** update formula to v3.4.1 ([2ce2aac](https://github.com/iwonz/ywtc/commit/2ce2aac45774234bff8ed37a6c1df592ffd4582a))
* **release:** retry report dashboard pipeline ([324456f](https://github.com/iwonz/ywtc/commit/324456fb5f6cec029d8c960ce75e6d91d031eb9e))

## [3.4.1](https://github.com/iwonz/ywtc/compare/v3.4.0...v3.4.1) (2026-10-16)


### Bug Fixes

* **migration:** recover title conflicts and explain blocked outcomes ([fde3fd8](https://github.com/iwonz/ywtc/commit/fde3fd831d64f4a6f0631e933f2d5534cfaacbaa))


### Maintenance

* **homebrew:** update formula to v3.4.0 ([4ccf192](https://github.com/iwonz/ywtc/commit/4ccf192ec4dfb27326c6568face2368912a990a9))
* **release:** retry patch release pipeline ([a1b4983](https://github.com/iwonz/ywtc/commit/a1b49838e7c95f9690e022e272bde292f75cc3e3))

## [3.4.0](https://github.com/iwonz/ywtc/compare/v3.3.0...v3.4.0) (2026-10-16)


### Features

* **migration:** archive page comments ([d3c5c61](https://github.com/iwonz/ywtc/commit/d3c5c61a187ad1739d49aba0bfeff245d15cec5b))


### Documentation

* **readme:** clarify transfer coverage and examples ([5c00306](https://github.com/iwonz/ywtc/commit/5c00306b19f5c1e9c04c955666ce435d08202df9))


### Maintenance

* **homebrew:** update formula to v3.3.0 ([86c587c](https://github.com/iwonz/ywtc/commit/86c587c1b19fa98b1e3546f3f4bbd1a2097551f5))
* **release:** retry comment archive pipeline ([783c478](https://github.com/iwonz/ywtc/commit/783c47807184d577108d853f2101fbd225d223e4))
* **release:** retry with valid commit message ([1fb3e78](https://github.com/iwonz/ywtc/commit/1fb3e787d7037d7367bde560c8e4bc34c83cbec6))

## [3.3.0](https://github.com/iwonz/ywtc/compare/v3.2.2...v3.3.0) (2026-10-15)


### Features

* **migration:** discover complete source subtrees ([c374df5](https://github.com/iwonz/ywtc/commit/c374df562d30008f1365a699de7f73692ddf2144))


### Continuous Integration

* **release:** retrigger validated release workflow ([393b385](https://github.com/iwonz/ywtc/commit/393b38522ab6215202b216df0d3c7a323bab9a9e))


### Maintenance

* **homebrew:** update formula to v3.2.2 ([6ac0913](https://github.com/iwonz/ywtc/commit/6ac0913ddc53ddf91c0b5f709f710d10b88df46d))

## [3.2.2](https://github.com/iwonz/ywtc/compare/v3.2.1...v3.2.2) (2026-10-15)


### Bug Fixes

* **migration:** recover deleted destination trees ([c126a44](https://github.com/iwonz/ywtc/commit/c126a4424f40bc7477a5b9f7299dd9e6e40353fc))
* **report:** reconcile source inventory and outcomes ([c57936a](https://github.com/iwonz/ywtc/commit/c57936a5a8623b8dd8bcdb27374cf7731af09f0d))


### Continuous Integration

* revalidate migration recovery changes ([a402714](https://github.com/iwonz/ywtc/commit/a402714d84f8d74f0177075aece4bd27601a391d))


### Maintenance

* **homebrew:** update formula to v3.2.1 ([d71c3c8](https://github.com/iwonz/ywtc/commit/d71c3c88998ee2369e6d18b8ba0784469a209444))

## [3.2.1](https://github.com/iwonz/ywtc/compare/v3.2.0...v3.2.1) (2026-10-15)


### Bug Fixes

* **migration:** reconcile resources and provider normalization ([0cbfc5e](https://github.com/iwonz/ywtc/commit/0cbfc5e6c851b0a3fe2e3d4d6fddd2af2c490c0d))


### Continuous Integration

* **release:** rerun checks after commitlint feedback ([2fce766](https://github.com/iwonz/ywtc/commit/2fce76665ed47eca8e89f4bf6633d532a42991ca))


### Maintenance

* **homebrew:** update formula to v3.2.0 ([87ba4bf](https://github.com/iwonz/ywtc/commit/87ba4bffb84907945d08854b4717f67297f4e417))

## [3.2.0](https://github.com/iwonz/ywtc/compare/v3.1.0...v3.2.0) (2026-10-15)


### Features

* **migration:** guarantee page content and expose reports ([5be596e](https://github.com/iwonz/ywtc/commit/5be596e8281900a8105cf7b77002506aac16ac6d))


### Maintenance

* **homebrew:** update formula to v3.1.0 ([0ab7a88](https://github.com/iwonz/ywtc/commit/0ab7a886cc2dac24a1315668c060fc094e51b221))
* **release:** resume pipeline after commitlint rejection ([54a04f7](https://github.com/iwonz/ywtc/commit/54a04f73184e625262ebbbed925b0767a18cc72b))

## [3.1.0](https://github.com/iwonz/ywtc/compare/v3.0.0...v3.1.0) (2026-10-15)


### Features

* **init:** add interactive setup wizard ([d4699b4](https://github.com/iwonz/ywtc/commit/d4699b4106808239a0cd773dc1c2c42aef5b2dab))


### Continuous Integration

* **release:** retrigger publication workflow ([23e4094](https://github.com/iwonz/ywtc/commit/23e4094adde2189a7c28bf330275b1a0b9ccaca3))


### Maintenance

* **homebrew:** update formula to v3.0.0 ([875ec34](https://github.com/iwonz/ywtc/commit/875ec34402154e5af52d9c2282a6419ab6a33346))

## [3.0.0](https://github.com/iwonz/ywtc/compare/v2.0.3...v3.0.0) (2026-10-15)


### ⚠ BREAKING CHANGES

* **workspace:** consolidate runtime configuration

### Features

* **workspace:** consolidate runtime configuration ([123f13b](https://github.com/iwonz/ywtc/commit/123f13ba2883de034b9b8f458fd01ad02576be70))


### Documentation

* **readme:** depict universal transfer paths ([1c7d01f](https://github.com/iwonz/ywtc/commit/1c7d01f907205bed8a44a8dc7819717a84130316))
* **readme:** stabilize information architecture ([03eb3e3](https://github.com/iwonz/ywtc/commit/03eb3e3ee8aefb76a00237aec7e2561184b214f5))


### Maintenance

* **ci:** resume release after commit validation ([1540b51](https://github.com/iwonz/ywtc/commit/1540b51727e6ca58816a1099b2add73a3eacf7cf))
* **homebrew:** update formula to v2.0.3 ([63262bb](https://github.com/iwonz/ywtc/commit/63262bb13e5765aa2f3a15f04e6f98a0379f247e))

## [2.0.3](https://github.com/iwonz/ywtc/compare/v2.0.2...v2.0.3) (2026-10-15)


### Bug Fixes

* **release:** wait for npm registry propagation ([e27d2e1](https://github.com/iwonz/ywtc/commit/e27d2e18fb41d80c8b07dea4fe610fab15ab6676))


### Maintenance

* **homebrew:** update formula to v2.0.2 ([479f375](https://github.com/iwonz/ywtc/commit/479f375afbb1344f41f261e4e77f1960b897bd4f))

## [2.0.2](https://github.com/iwonz/ywtc/compare/v2.0.1...v2.0.2) (2026-10-15)


### Bug Fixes

* **homebrew:** document required tap trust ([d6d1257](https://github.com/iwonz/ywtc/commit/d6d1257ca4b4777039f899acc168c52d3890a07a))


### Maintenance

* **homebrew:** update formula to v2.0.1 ([099f7c4](https://github.com/iwonz/ywtc/commit/099f7c4c42bd2d63069de79890390ce788c2198e))

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

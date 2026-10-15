## MODIFIED Requirements

### Requirement: Initial release bootstrap
The repository SHALL document and support a one-time interactive owner publication of `@iwonz/ywtc@0.0.0` under the `bootstrap` dist-tag followed by `npm trust github` binding before the first OIDC release.

#### Scenario: Package does not exist
- **WHEN** the scoped package has not yet been created in npm
- **THEN** owner `iwonz` SHALL publish the minimal validated bootstrap package with interactive 2FA and no repository token

#### Scenario: Trusted publisher is configured
- **WHEN** the bootstrap package exists and the release workflow is present on `master`
- **THEN** the owner SHALL bind `iwonz/ywtc` and `release.yml` with `--allow-publish` and complete the first OIDC release within the trust-command validity window

#### Scenario: Maintainer follows the public checklist
- **WHEN** a maintainer prepares the first release
- **THEN** README SHALL state the npm CLI prerequisite, interactive bootstrap command, exact trusted publisher command, GitHub Actions PR setting and its permission boundary, and the Release Please merge sequence without exposing credentials

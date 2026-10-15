# Spec Delta

## MODIFIED Requirements

### Requirement: Initial release bootstrap
The repository SHALL support a one-time interactive owner publication of `@iwonz/ywtc@0.0.0` under the `bootstrap` dist-tag followed by `npm trust github` binding, while the public README SHALL omit this completed setup procedure once trusted publishing is operational.

#### Scenario: Package does not exist
- **WHEN** the scoped package has not yet been created in npm
- **THEN** owner `iwonz` SHALL publish the minimal validated bootstrap package with interactive 2FA and no repository token

#### Scenario: Trusted publisher is configured
- **WHEN** the bootstrap package exists and the release workflow is present on `master`
- **THEN** the owner SHALL bind `iwonz/ywtc` and `release.yml` with `--allow-publish` and complete the first OIDC release within the trust-command validity window

#### Scenario: Maintainer follows the public checklist
- **WHEN** a maintainer must bootstrap a new package identity before trusted publishing is operational
- **THEN** they SHALL use the validated release tooling and current npm trusted-publishing documentation for the interactive publish, trust binding, permission boundary, and first release sequence without exposing credentials

#### Scenario: Trusted publishing is operational
- **WHEN** the npm package has been bootstrapped and repository-bound trusted publishing succeeds
- **THEN** the README SHALL document only the current automated release model under Development and SHALL NOT retain the one-time bootstrap checklist

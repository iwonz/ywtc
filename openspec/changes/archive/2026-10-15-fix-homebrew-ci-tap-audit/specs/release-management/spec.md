## MODIFIED Requirements

### Requirement: Same-repository Homebrew distribution
The release workflow SHALL generate and maintain `Formula/ywtc.rb` in `iwonz/ywtc` from the published npm archive so macOS operators can use an explicit same-repository tap. Formula processing SHALL follow every successful npm/GitHub publication job, including authorized manual recovery, and use Homebrew's supported Node/npm installation contract.

#### Scenario: Formula generation
- **WHEN** npm version `X.Y.Z` is available
- **THEN** automation SHALL obtain the registry tarball URL and SHA-256, generate a Node formula for `ywtc`, and avoid embedding credentials or local paths

#### Scenario: Canonical npm formula
- **WHEN** automation renders formula metadata and installation steps
- **THEN** the formula SHALL use Homebrew's canonical component order, standard npm arguments, and standard `libexec` binary linking

#### Scenario: Formula verification
- **WHEN** a formula candidate is generated
- **THEN** macOS CI SHALL check its style, stage the exact candidate in an isolated non-git tap, and run strict audit, installation, formula test, and functional CLI version checks through the fully qualified formula name before updating `master`

#### Scenario: Formula publication
- **WHEN** formula verification succeeds
- **THEN** automation SHALL fast-forward current `master`, create commit `chore(homebrew): update formula to vX.Y.Z`, and push without force so `brew update` and `brew upgrade ywtc` discover it

#### Scenario: Manual release recovery publishes artifacts
- **WHEN** an authorized manual recovery completes npm/GitHub publication successfully while automatic Release Please processing is skipped
- **THEN** the Homebrew job SHALL still generate, verify, and publish the formula for the recovered version

#### Scenario: Publication prerequisite fails
- **WHEN** npm/GitHub publication fails or does not run
- **THEN** the Homebrew job SHALL remain skipped and SHALL NOT modify `master`

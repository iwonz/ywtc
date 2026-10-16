# Spec Delta

## ADDED Requirements

### Requirement: Guided interactive migration
The CLI SHALL provide `ywtc migrate --interactive` and `ywtc migrate -i` as a TTY-only state-machine wizard that produces the same validated migration request as non-interactive invocation while retaining edited draft values across navigation.

#### Scenario: Guided default flow
- **WHEN** the operator starts interactive migration without endpoint options
- **THEN** the wizard SHALL default to Yandex Wiki source, Confluence destination, `subtree` scope, source status `all`, comments enabled, archive disabled, automatic state, and configured concurrency

#### Scenario: Command values prefill the wizard
- **WHEN** interactive migration receives any supported migration options
- **THEN** those values SHALL become editable initial answers and SHALL retain their existing semantics unless the operator changes them

#### Scenario: Required interactive stages
- **WHEN** the operator proceeds through the wizard
- **THEN** it SHALL require workdir, compatible source provider/profile/locator, compatible remote destination provider/profile/locator or Markdown/HTML output directory, scope, comment choice, and a final action

#### Scenario: Conditional archive stage
- **WHEN** the selected destination is Markdown or HTML
- **THEN** the wizard SHALL offer an archive choice defaulting to disabled
- **AND** changing destination to a remote provider SHALL clear any prior archive choice

#### Scenario: Missing workspace
- **WHEN** the selected workdir has no usable configuration
- **THEN** the wizard SHALL offer interactive initialization as the default action, another path, or exit, and SHALL return to migration setup after successful initialization

#### Scenario: Backward navigation
- **WHEN** the operator goes backward and then forward between completed stages
- **THEN** validated answers SHALL remain in memory and required values SHALL remain editable without exposing credentials

#### Scenario: Non-interactive terminal
- **WHEN** `migrate --interactive` runs without interactive input and output terminals
- **THEN** it SHALL exit with usage code `2` before filesystem or API mutation and SHALL explain how to use non-interactive migration

#### Scenario: Wizard cancellation
- **WHEN** the operator cancels or sends SIGINT before an operation begins
- **THEN** the wizard SHALL make no migration mutation and return code `130`

### Requirement: Interactive dry-run and live handoff
The wizard SHALL execute dry-run and live actions through the ordinary migration runner, SHALL require an explicit live choice, and SHALL preserve state identity, reports, output, signal handling, and exit-code semantics across sequential actions in one process.

#### Scenario: Default final action
- **WHEN** setup reaches its final action menu
- **THEN** `Сначала dry-run` SHALL be selected by default ahead of live execution, editing, and exit

#### Scenario: Dry-run completes without blockers
- **WHEN** dry-run inventory is complete and has no root error, failed page, blocked page, or ownership conflict
- **THEN** the next-action menu SHALL offer report opening, live execution with the same effective request, editing, repeating dry-run, and exit

#### Scenario: Dry-run finds a blocking outcome
- **WHEN** dry-run inventory is incomplete or contains a root error, failed page, blocked page, or ownership conflict
- **THEN** live execution SHALL not be offered while report opening, editing, repeating dry-run, and exit remain available

#### Scenario: Non-blocking quality findings
- **WHEN** dry-run contains only warnings, adaptations, safe normalizations, or verified degradations without a blocking outcome
- **THEN** the wizard SHALL permit an explicit live choice

#### Scenario: Dry-run mutation boundary
- **WHEN** the operator selects dry-run from any wizard menu
- **THEN** the run SHALL perform no remote or filesystem-destination mutation and SHALL produce its ordinary state selection and report output

#### Scenario: Exit after an operation
- **WHEN** the operator exits after dry-run or live execution
- **THEN** the wizard SHALL return the exit code of the latest completed operation; SIGINT and SIGTERM SHALL retain codes `130` and `143`

### Requirement: Stable public CLI aliases
The CLI SHALL retain every existing long option and SHALL expose only the documented unique short aliases without changing command-specific validation or defaults.

#### Scenario: Migration aliases are parsed
- **WHEN** migration receives `-i`, `-w`, `-s`, `-d`, `-S`, `-D`, `-m`, `-t`, `-C`, `-N`, `-f`, `-a`, `-n`, `-F`, `-o`, `-j`, or `-r`
- **THEN** each alias SHALL have exactly the same value and validation as its corresponding long option

#### Scenario: Update aliases are parsed
- **WHEN** update receives `-i` or `-c`
- **THEN** they SHALL behave exactly as command-scoped `--install` and `--via`

#### Scenario: Command-scoped aliases coexist
- **WHEN** the same short alias exists on distinct subcommands, including `-i` and `-w`
- **THEN** Commander SHALL resolve it only within the active command without colliding with global help or version aliases

#### Scenario: Non-interactive endpoint requirement
- **WHEN** `migrate` runs without interactive mode and either source or destination is absent
- **THEN** it SHALL exit with usage code `2` before workspace, filesystem, or API mutation

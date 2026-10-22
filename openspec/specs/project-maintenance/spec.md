# project-maintenance Specification

## Purpose
Maintain ywtc as a public, testable, documented, and release-safe TypeScript project with a mandatory OpenSpec change lifecycle.

## Requirements

### Requirement: Complete OpenSpec change lifecycle
Repository agents MUST synchronize a clean local `master` with `origin/master` before starting a change, execute the complete OpenSpec lifecycle for every code, documentation, tooling, or specification change, and repeat the remote comparison before commit and push.

#### Scenario: An agent begins a clean change
- **WHEN** local `master` is clean and not diverged
- **THEN** the agent MUST fetch and fast-forward pull `origin/master`, then create and validate proposal, specification, design, and task artifacts before implementation

#### Scenario: Repository is dirty or diverged
- **WHEN** synchronization detects uncommitted content, another branch, or diverged history
- **THEN** the agent MUST stop, report the condition, and MUST NOT discard or rewrite existing work

#### Scenario: An agent completes implementation
- **WHEN** all implementation tasks and checks succeed
- **THEN** it MUST update task status, sync delta specifications, archive the change, run strict validation, fetch and compare with `origin/master`, and only then commit and push without force

### Requirement: Executable project quality gates
The project SHALL keep a high/critical production dependency audit, TypeScript typechecking, Biome lint checks, Knip unused-code checks, Vitest tests, package verification, build validation, OpenSpec strict validation, graph performance checks, and static HTML browser smoke checks executable through maintained scripts.

#### Scenario: A maintainer checks the repository
- **WHEN** `npm run check` is executed in a clean supported environment
- **THEN** release hygiene, production dependency audit, typechecking, Biome, Knip, tests, browser checks, build, package verification, and strict OpenSpec validation SHALL all run and fail the command on violations

### Requirement: Public repository documentation and metadata
The README SHALL be concise, provider-neutral, task-oriented, and complete enough to install, configure, validate, operate, and troubleshoot the current product without historical migration guidance or duplicated rules.

#### Scenario: First-time setup
- **WHEN** a new operator reads README and the generated template
- **THEN** they SHALL be able to create named connections with direct credentials, validate with doctor, and run a remote transfer or static export without consulting source code

#### Scenario: Runtime compatibility
- **WHEN** package metadata, documentation, CI, or the generated Homebrew formula selects a JavaScript runtime
- **THEN** it SHALL consistently require Node.js 24 and npm 11.5.1 or newer and SHALL NOT claim Node.js 22 support

#### Scenario: A new operator reads the README
- **WHEN** the repository README is opened
- **THEN** it SHALL present the verified full-width header, a one-paragraph product definition, and a copyable shortest path to install, initialize, and start an interactive dry-run

#### Scenario: Stable README information architecture
- **WHEN** the README's second-level headings are inspected
- **THEN** their exact order SHALL be `Быстрый старт`, `Возможности`, `Совместимость`, `Конфигурация`, `CLI`, `Файловый экспорт`, `State и повторные запуски`, `Отчёты и статусы`, and `Разработка`
- **AND** installation SHALL live with the guided start, credentials with configuration, common examples with CLI, limitations with capabilities, and outcome definitions with reports

#### Scenario: Minimum migration flow is followed
- **WHEN** an operator wants the shortest safe path from installation to migration
- **THEN** the README SHALL provide copyable commands to install ywtc, run `ywtc init --interactive`, and run `ywtc migrate --interactive`
- **AND** the migration wizard's default dry-run and explicit live handoff SHALL be explained once without a separate duplicate checklist

#### Scenario: Common command variants are needed
- **WHEN** an operator needs a frequent workflow beyond the minimum
- **THEN** the CLI section SHALL show four concise examples covering a remote subtree transfer, linked scope, static export, and targeted retry
- **AND** each example SHALL omit options supplied by defaults or automatic profile resolution

#### Scenario: Migration coverage is reviewed
- **WHEN** an operator evaluates content fidelity
- **THEN** the capabilities section SHALL contain a detailed supported-content table followed by a concise limitations table
- **AND** the tables SHALL distinguish preserved content, native normalization, complete adaptation, explicit fallback, and excluded data

#### Scenario: README readability is reviewed
- **WHEN** documentation repeats a rule, caveat, status, or operational instruction across sections
- **THEN** the README SHALL retain one canonical explanation and remove the duplicate rather than relying on cross-section repetition
- **AND** it SHALL omit obsolete compatibility guidance, completed one-time setup procedures, filler headings, and prose that only restates a table

#### Scenario: CLI help is opened
- **WHEN** an operator runs `ywtc --help`, `ywtc <command> --help`, or `ywtc --version`
- **THEN** the output SHALL identify `ywtc`, list the current commands, and provide command-specific usage without requiring configuration

#### Scenario: Platform compatibility is inspected
- **WHEN** an operator evaluates a Yandex Wiki or Confluence connection
- **THEN** the compatibility section SHALL identify Public API v1, Data Center 7.9+ without an upper bound subject to capability preflight, Cloud API support, unsupported profiles, and the boundary between contract tests and live certification

#### Scenario: Parameters are inspected
- **WHEN** an operator constructs any supported command or configuration
- **THEN** the configuration and CLI sections SHALL provide compact complete tables for direct connection fields, commands, long and short options, defaults, accepted formats, examples, and descriptions

#### Scenario: Token setup is inspected
- **WHEN** an operator follows authentication instructions
- **THEN** the configuration section SHALL give short vendor-linked checklists for obtaining Yandex OAuth/IAM, Data Center PAT, and Cloud email/API token and placing them directly in ignored `ywtc.config.yaml` without real credentials in tracked examples

#### Scenario: Package metadata is inspected
- **WHEN** npm or release tooling consumes package metadata
- **THEN** it SHALL name `@iwonz/ywtc`, expose binary `ywtc`, allow public scoped publication, require Node.js 24 and npm 11.5.1 or newer, reference the repository and MIT license, and include only intended publishable files

### Requirement: Installable package verification
The public `@iwonz/ywtc` package SHALL include the universal `ywtc` binary, an empty current configuration template, README, license, changelog, and required generated assets while excluding populated configuration, credentials, workdirs, state, cache, exports, reports, and tests.

#### Scenario: Packed CLI smoke test
- **WHEN** the tarball is installed in an isolated environment
- **THEN** `ywtc --version`, help, config-only initialization, strict profile validation, and non-mutating example parsing SHALL work on supported Node.js versions

#### Scenario: Package acceptance
- **WHEN** release validation packs the project
- **THEN** it SHALL install that archive into an isolated prefix and successfully run `ywtc --version`, `ywtc --help`, and workspace initialization without relying on source-only files or creating `.env` and marker files

### Requirement: Conventional Commit enforcement
The project SHALL validate every full maintainer and automation commit message against Conventional Commits and reject generic or work-in-progress subjects.

#### Scenario: Commit range validation
- **WHEN** CI evaluates a pull request or push
- **THEN** Commitlint SHALL check every new commit in the relevant range, including bot commits, with the configured header and body rules

#### Scenario: Generic subject
- **WHEN** a subject is empty, generic, temporary, or marked WIP
- **THEN** commit validation SHALL fail with a corrective Conventional Commit example

#### Scenario: Commit is prepared and pushed
- **WHEN** an agent prepares a commit after the quality gate
- **THEN** it SHALL validate the complete proposed message, including body line lengths, before committing and validate the actual new commit range before pushing
- **AND** a failed commit check SHALL NOT be bypassed by an empty follow-up commit or a narrower unreviewed range

### Requirement: Maintained GitHub Actions runtimes
The release workflow SHALL use supported major versions of its JavaScript actions and SHALL avoid action runtimes GitHub marks deprecated.

#### Scenario: Workflow action versions are reviewed
- **WHEN** CI executes checkout, Node.js setup, or Release Please
- **THEN** the workflow SHALL use `actions/checkout@v7`, `actions/setup-node@v7`, and `googleapis/release-please-action@v5` or later compatible maintained majors

### Requirement: Universal transfer header
The README header SHALL accurately depict Yandex Wiki and Confluence as sources feeding the `ywtc` pipeline and SHALL depict Confluence, Yandex Wiki, Markdown, and HTML as destinations while preserving the established dark technical visual style.

#### Scenario: Visual transfer matrix is inspected
- **WHEN** a reader views the README header
- **THEN** both remote providers SHALL be identifiable as possible sources
- **AND** both remote providers and both static formats SHALL be identifiable as possible destinations
- **AND** directional connectors SHALL communicate convergence into and branching out of `ywtc`
- **AND** the central transferable-content tiles SHALL remain visually unchanged except that no small arrows SHALL appear between adjacent tiles

#### Scenario: Header is read without images
- **WHEN** the header image is unavailable or interpreted by assistive technology
- **THEN** its alternative text SHALL identify the two source providers, the `ywtc` pipeline, and all four destination types

### Requirement: Guided setup package contract
The public package and README SHALL expose interactive initialization and interactive migration as the shortest guided setup while retaining ordinary commands for automation.

#### Scenario: Automation setup
- **WHEN** an operator does not have an interactive terminal or manages configuration separately
- **THEN** the README SHALL retain concise ordinary `ywtc init`, direct `ywtc.config.yaml`, and non-interactive `ywtc migrate` guidance in their canonical configuration and CLI sections

#### Scenario: Public CLI help
- **WHEN** an operator opens `ywtc init --help`
- **THEN** the packaged CLI SHALL document `--interactive`, `--workdir`, TTY requirements, and the non-interactive alternative without loading configuration

#### Scenario: Public migration help
- **WHEN** an operator opens `ywtc migrate --help`
- **THEN** the packaged CLI SHALL document interactive mode, all supported short aliases, conditional non-interactive endpoint requirements, and the dry-run-first workflow without loading configuration

#### Scenario: Packaged non-TTY behavior
- **WHEN** package verification invokes either interactive wizard without a TTY
- **THEN** it SHALL fail before workspace, destination, or network mutation with the documented actionable message

### Requirement: Content safety and report access documentation
The packaged CLI and README SHALL describe current content-preservation and report-access behavior in the canonical capabilities, state, and reports sections.

#### Scenario: Operator reviews migration safety
- **WHEN** an operator reads the current README
- **THEN** the capabilities and state sections SHALL explain source-derived bodies, resource fallbacks, partial retries, actual-content verification, and the no-deletion boundary without repeating those guarantees in other sections

#### Scenario: Packaged report commands are inspected
- **WHEN** an installed package runs `ywtc --help`, `ywtc reports --help`, or `ywtc migrate --help`
- **THEN** the output SHALL expose report listing, report opening, and opt-in post-run opening without loading connection configuration

### Requirement: Source selection documentation
The README SHALL document complete subtree selection and the provider-neutral source-status filter in the canonical CLI and state sections.

#### Scenario: Operator reviews subtree behavior
- **WHEN** the operator reads the CLI scope reference
- **THEN** it SHALL state that `subtree` and source status `all` are defaults, explain Yandex `actual` and `obsolete` coverage, describe Confluence hierarchy limitations, and show how to select `current`

#### Scenario: Operator changes source status on rerun
- **WHEN** the operator reads the state section
- **THEN** the documentation SHALL explain stable state identity, non-deletion of mappings outside the current selection, and how selected or excluded pages appear in reports

### Requirement: Comment archive documentation
The README SHALL document page comment archival once across capabilities, configuration-free CLI controls, state, reports, and limitations.

#### Scenario: Transfer coverage is reviewed
- **WHEN** an operator reads the capabilities and CLI sections
- **THEN** comments and explicitly linked page attachments SHALL appear as supported content, `--no-comments` SHALL be documented, and reactions plus attachment/blog/custom-content comments SHALL remain listed as limitations

#### Scenario: Failure behavior is reviewed
- **WHEN** an operator reads the state and reports sections
- **THEN** the documentation SHALL explain resumable partial comment outcomes, stale archive preservation, counts, previews, and non-deletion without restating comment rendering details

### Requirement: Packaged comment CLI verification
Package and project checks SHALL exercise the public comment flags, provider contracts, normalized rendering, deterministic archives, resume behavior, report reconciliation, and filesystem output without including runtime comments or identity data in the published package.

#### Scenario: Packaged help
- **WHEN** an installed package runs `ywtc migrate --help` or `ywtc doctor --help`
- **THEN** both commands SHALL document comments enabled by default and the `--no-comments` opt-out without loading workspace configuration

#### Scenario: Publication hygiene
- **WHEN** the npm package is packed
- **THEN** source fixtures, cached comment bodies, generated ZIPs, reports, tokens, email addresses, and runtime state SHALL be excluded

### Requirement: Deterministic transfer status reference
The README SHALL explain every current reported status in object-specific tables with numbered assignment conditions, applicability, and an operator action, while keeping outcome, quality, retryability, and exit code distinct.

#### Scenario: Operator inspects an object status
- **WHEN** an operator reads `Отчёты и статусы`
- **THEN** tables SHALL cover pages, files, comment archives, Grid snapshots, mentions, runs, excluded pages, and traversal edges using their current vocabularies
- **AND** each status SHALL have a dedicated conditions column containing a numbered list of deterministic assignment branches and a next action

#### Scenario: Incomplete status is interpreted
- **WHEN** a page, file, or archive is failed, blocked, or not-started
- **THEN** documentation SHALL explain whether the current operation lacks verification or a dependency, and SHALL NOT imply that previous or bootstrap destination data is absent

#### Scenario: Intermediate or reserved value is inspected
- **WHEN** a status exists only during processing or is accepted by the current type but has no automatic producer
- **THEN** documentation SHALL explicitly identify that scope and SHALL NOT invent reachable assignment conditions
- **AND** planned SHALL be described as dry-run-only in finalized outcomes rather than forbidden during live preparation

#### Scenario: Run status and exit code are inspected
- **WHEN** an operator compares run status, object outcomes, issues, and command exit code
- **THEN** documentation SHALL state their current precedence, warning/degradation behavior, signal handling, and retry completion rules without equating partial-page count with a nonzero normal-migration exit code

#### Scenario: Quality and retryability are inspected
- **WHEN** a complete page has an adaptation, normalization, preserved external reference, or unresolved mention warning
- **THEN** documentation SHALL distinguish completeness from notification delivery, warnings from degradations, and transient mention retry from terminal unresolved identity

#### Scenario: README status coverage is checked
- **WHEN** repository validation runs
- **THEN** it SHALL reject missing or malformed numbered status-condition tables
- **AND** tests SHALL compare the documented values with current state and domain status unions so an added status requires documentation review

#### Scenario: README structure is checked
- **WHEN** the status reference is updated
- **THEN** status definitions SHALL remain only in `Отчёты и статусы` within the existing nine second-level headings

### Requirement: Packaged report application
The project SHALL compile and package the report dashboard as a self-contained generated asset that the installed CLI can inject with per-run data without depending on repository source files.

#### Scenario: Installed package writes a report
- **WHEN** an isolated installation completes a report-writing smoke test
- **THEN** the package SHALL produce an offline `index.html` with embedded application assets plus a separate sanitized `report.json`

#### Scenario: Report shell integrity is checked
- **WHEN** build or package validation inspects the generated shell
- **THEN** it SHALL find exactly one data-injection marker and SHALL fail rather than emit a partial report when that invariant is violated

### Requirement: Provider-neutral report illustration
The package SHALL include a transparent provider-neutral report illustration that identifies both remote sources, the transferable content classes, and all remote and static destinations while matching the README header composition.

#### Scenario: Illustration is rendered in either theme
- **WHEN** the dashboard uses light or dark mode on desktop or mobile
- **THEN** the illustration SHALL remain legible, preserve transparency, fit without clipping, and contain no migration-specific organization data
- **AND** it SHALL preserve the input and output connectors while omitting only the small arrows between adjacent central content tiles

### Requirement: Interactive report quality gates
Project checks SHALL validate reconciled adaptation and degradation accounting in addition to offline behavior, accessibility, localization, theming, responsiveness, privacy, and packaging.

#### Scenario: Browser suite runs
- **WHEN** the maintained Playwright report suite opens a generated report through `file://`
- **THEN** it SHALL exercise reconciled status and quality totals, hierarchy interactions, details, preferences, desktop/mobile themes and languages without application network requests

#### Scenario: Adapted complete page is inspected
- **WHEN** report fixtures contain a complete page with static Grid, layout, or external-reference adaptations
- **THEN** the page SHALL remain complete and adaptations SHALL remain separate from degradations, warnings, and conflicts in every report surface

#### Scenario: Preference controls are inspected
- **WHEN** browser checks activate language and theme buttons
- **THEN** tooltips, accessible names, current and next modes, deterministic cycles, and safe storage persistence SHALL be verified

#### Scenario: Privacy suite runs
- **WHEN** report fixtures contain script-like text, unsafe URLs, private previews, tokens, or email addresses
- **THEN** checks SHALL prove active content is isolated and downloadable JSON plus package contents do not expose protected values

### Requirement: Interactive report documentation
The README SHALL describe the compact offline dashboard and its distinct information-impact categories within `Отчёты и статусы`.

#### Scenario: Operator reads report guidance
- **WHEN** an operator reads the reports section
- **THEN** it SHALL concisely explain report creation and opening, the flat overview, hierarchy search and filters, per-page details and comparison, preference controls, sanitized JSON download, and quality totals without narrating decorative UI details

### Requirement: Deterministic offline report typography
The packaged report application SHALL render its interface with self-hosted font resources embedded in the autonomous HTML shell and SHALL NOT depend on fonts installed by the host operating system.

#### Scenario: Report opens offline
- **WHEN** a generated report is opened through `file://` on a supported platform
- **THEN** its Latin and Cyrillic interface text SHALL use the packaged typeface without a network request or system-font dependency

#### Scenario: Visual checks run on supported CI platforms
- **WHEN** desktop/mobile and light/dark report snapshots run in Linux CI or the maintained local development environment
- **THEN** the same strict visual baselines SHALL pass without platform-specific height drift or broadly relaxed comparison thresholds

#### Scenario: Package is installed in isolation
- **WHEN** the npm tarball generates a report outside the source checkout
- **THEN** the resulting single HTML file SHALL contain the font resources required to render the dashboard autonomously

### Requirement: Content-equivalence documentation
The README supported-content table SHALL distinguish exact preservation, safe normalization, complete static adaptation, and incomplete fallback without adding another second-level section.

#### Scenario: Operator evaluates layout fidelity
- **WHEN** the operator reads `Возможности`
- **THEN** the table SHALL explain native column preservation plus complete responsive HTML and ordered Markdown adaptations when all cells remain available

#### Scenario: Operator evaluates dynamic tables and external media
- **WHEN** the operator compares provider constructs
- **THEN** the table SHALL identify verified Grid snapshots as complete adaptations and unchanged external image URLs as preserved references rather than partial transfers

#### Scenario: Operator evaluates provider constructs
- **WHEN** the operator compares Yandex Wiki and Confluence features
- **THEN** the table SHALL identify supported pairs for notes/callouts, cuts/expand, tree/children, task lists, code, anchors, links, images, and attachments and SHALL keep genuinely incomplete constructs in the concise limitations table

#### Scenario: Empty structural page is documented
- **WHEN** a source page has no meaningful content and exists only as a hierarchy container
- **THEN** the documentation SHALL state that it transfers as a valid empty page rather than a fallback or degradation

### Requirement: Mapped-object authority documentation
The README SHALL explain mapped-object authority in `State и повторные запуски` and compact outcome interpretation in `Отчёты и статусы`.

#### Scenario: Mapped destination policy is reviewed
- **WHEN** an operator reads the state section
- **THEN** it SHALL state that current source content and hierarchy replace differing proven mappings through destination version history while unmapped or ambiguously owned objects remain protected

### Requirement: Compact report presentation
The interactive report SHALL prioritize non-zero outcomes, actionable diagnostics, and transfer completeness in a flat document layout while omitting empty metrics and redundant controls.

#### Scenario: Overview contains zero-valued optional metrics
- **WHEN** a report has no excluded pages, failures, conflicts, comments, attachments, or other optional metric values
- **THEN** the overview SHALL omit those zero-value counters and any resulting empty category
- **AND** it SHALL retain the total pages, overall status, canonical source and destination, and report identity needed to understand the run
- **AND** an unavailable required inventory value SHALL use a concise textual empty state rather than a numeric zero

#### Scenario: A non-zero outcome requires attention
- **WHEN** a page, resource, comment archive, quality category, or inventory dimension has a non-zero outcome
- **THEN** the report SHALL display that metric with its semantic label and visual impact treatment
- **AND** the hierarchy and details view SHALL expose the affected object and available corrective action

#### Scenario: Main report layout is inspected
- **WHEN** the report overview and hierarchy render
- **THEN** they SHALL use flat sections, spacing, and separators without outer cards, borders, shadows, blur, rounded islands, or a separate tree container
- **AND** complete hierarchy rows SHALL remain transparent while non-complete rows MAY use a light full-width semantic tint
- **AND** the functional modal MAY remain a distinct overlay surface

#### Scenario: Page details contain empty sections
- **WHEN** a page has no resources, comments, preview, conflicts, or issues for an optional detail category
- **THEN** the details interface SHALL omit the empty category or present one concise empty state only when the absence itself is useful
- **AND** it SHALL NOT repeat zero counters, placeholder definition rows, or unavailable identifiers across the view
- **AND** definition data and technical diagnostics SHALL use flat lists rather than nested tiles

#### Scenario: Offline report interactions are used
- **WHEN** a generated report is opened through `file://` on desktop or mobile
- **THEN** summary, hierarchy, search, problem filters, page details, preferences, JSON download, and sandboxed comparison SHALL remain usable without network requests
- **AND** the interface SHALL retain keyboard navigation, focus management, accessible names, light/dark themes, RU/EN localization, and large-tree virtualization

#### Scenario: UI dependencies are inspected
- **WHEN** project dependencies and report source are reviewed
- **THEN** the report SHALL use one maintained component system rather than a parallel custom shadcn-style primitive layer
- **AND** report-only Radix, Tailwind, CVA, clsx, and tailwind-merge dependencies SHALL be absent

### Requirement: Packaged interactive migration verification
Project and package checks SHALL exercise interactive migration parsing and the wizard state machine without contacting provider APIs or relying on a real TTY.

#### Scenario: Installed package exposes aliases
- **WHEN** package validation inspects installed command help and parses representative invocations
- **THEN** it SHALL confirm every documented migration and update alias maps to the same option as its long form

#### Scenario: Wizard workflow is tested
- **WHEN** automated checks run the prompt-adapter scenarios
- **THEN** they SHALL cover defaults, backward navigation, flag prefill, provider/profile selection, all four destination kinds, conditional archive, nested initialization, cancellation, and dry-run actions

#### Scenario: Safe live handoff is tested
- **WHEN** dry-run results contain blocking or non-blocking outcomes
- **THEN** tests SHALL prove live is offered only for the non-blocking result and starts only after an explicit selection with the same effective migration request

### Requirement: Packaged provider-failure regression verification
Package verification SHALL execute the built and isolated installed CLI against deterministic local provider fixtures for invalid successful HTTP responses so source-only tests cannot mask missing runtime validation in the published artifact.

#### Scenario: Installed CLI receives Confluence startup HTML
- **WHEN** the packed CLI runs a non-mutating migration against a local Confluence fixture that returns a startup/error HTML page with HTTP 200
- **THEN** package verification SHALL require a non-zero exit with an actionable provider-unavailable diagnostic
- **AND** it SHALL fail if output contains raw markup, a property-access TypeError, or evidence of destination mutation

#### Scenario: Source test and built artifact differ
- **WHEN** generated JavaScript omits or changes provider response validation covered by source tests
- **THEN** package verification SHALL fail by exercising the installed binary behavior rather than accepting help, version, and initialization checks alone

### Requirement: Packaged targeted retry workflow
The public package and canonical README SHALL expose the run-correlated retry workflow with its safe defaults, report lineage, exit behavior, and no-deletion boundary.

#### Scenario: Public retry help is inspected
- **WHEN** an installed package runs `ywtc retry --help`
- **THEN** it SHALL document the required canonical Run ID and the `--workdir`, `--dry-run`, `--open-report`, and `--concurrency` aliases without loading connection configuration

#### Scenario: Operator reads continuation guidance
- **WHEN** an operator reads the CLI, state, or reports documentation
- **THEN** one canonical explanation SHALL show `ywtc retry <run-id>`, define actionable versus terminal outcomes, and explain that repeated root Run IDs continue the latest live lineage without repeating successful objects

#### Scenario: Package verification runs
- **WHEN** the npm tarball is installed in isolation
- **THEN** smoke tests SHALL verify retry help and deterministic local report/state planning without credentials, provider access, or destination mutation

### Requirement: Packaged diagram and large-resource regressions
Project and package checks SHALL exercise diagram preservation and resumable resource transport with deterministic fixtures that do not contain organization data or require external provider access.

#### Scenario: Large inline Draw.io fixture
- **WHEN** the test suite processes a page containing a megabyte-scale inline Draw.io payload
- **THEN** it SHALL complete within bounded time, preserve source and representation hashes, keep progress responsive, and reject a false complete result if the diagram is omitted

#### Scenario: Diagram format matrix
- **WHEN** golden conversion tests run
- **THEN** they SHALL cover Draw.io, Mermaid, PlantUML, and D2 for native preservation where supported and source-preserving adaptation elsewhere

#### Scenario: Interrupted range download
- **WHEN** a local provider fixture interrupts a resource response and later serves a valid byte range
- **THEN** tests SHALL prove only the remaining bytes are transferred and the promoted cache object matches the expected SHA-256

#### Scenario: Invalid resume response
- **WHEN** the fixture ignores a range or returns an incompatible validator or content range
- **THEN** tests SHALL prove the client restarts safely without corrupt concatenation

#### Scenario: Package is installed in isolation
- **WHEN** the packed CLI processes diagram fixtures and resumable downloads outside the source checkout
- **THEN** required runtime assets and dependencies SHALL be present while source payload fixtures, cache files, and generated reports remain excluded from the package

### Requirement: Hermetic browser quality gates
Automated quality and publication jobs that execute browser tests SHALL provision the browser version required by the locked project dependencies before running the complete project check.

#### Scenario: Matrix quality job runs
- **WHEN** a GitHub Actions quality job installs project dependencies
- **THEN** it SHALL install the required Chromium browser and operating-system dependencies before `npm run check`

#### Scenario: Release candidate is validated
- **WHEN** a release publication job validates a tagged revision with the complete project check
- **THEN** it SHALL install the required Chromium browser and operating-system dependencies after `npm ci` and before `npm run check`

#### Scenario: Browser provisioning fails
- **WHEN** the required browser or its operating-system dependencies cannot be installed
- **THEN** the affected quality or publication job SHALL fail before reporting a successful quality gate or publishing an artifact

#### Scenario: Workflow contract is checked
- **WHEN** project tests inspect the release workflow
- **THEN** they SHALL verify browser provisioning is present in every browser-bearing job and ordered between dependency installation and the complete project check

### Requirement: Mention transfer documentation and quality gates
The README and project checks SHALL describe and verify the current global mention policy, provider limitations, safe fallback semantics, report outcomes, and publication privacy without adding a new second-level README section.

#### Scenario: Operator configures mention transfer
- **WHEN** the operator reads `Конфигурация`
- **THEN** the README SHALL show the disabled default plus concise template and auto examples, list valid placeholders and aliases, and explain native-resolution limitations once

#### Scenario: Operator interprets mention outcomes
- **WHEN** the operator reads `Возможности` or `Отчёты и статусы`
- **THEN** the documentation SHALL distinguish native, linked, text, preserved, unresolved, and failed mentions and state that verified unresolved fallback does not make a page partial

#### Scenario: Package checks run
- **WHEN** the complete project or package verification runs
- **THEN** it SHALL cover strict configuration, provider lookup contracts, normalized rendering, comment safety, retry selection, report reconciliation, and installed-package parsing without external provider access

#### Scenario: Reports and package are inspected
- **WHEN** report JSON, generated HTML, logs, state, or package contents are validated
- **THEN** they SHALL contain no credentials, authorization values, configured secret tokens, or hidden destination email fields introduced by mention resolution

### Requirement: Canonical maintenance documentation
Current specifications SHALL describe the current product, README SHALL own operator guidance, AGENTS SHALL own the contributor workflow, and OpenSpec context SHALL summarize stable constraints without duplicating those references.

#### Scenario: Documentation is maintained
- **WHEN** a change updates a public option, default, status, retry rule, configuration field, or release process
- **THEN** the maintainer SHALL verify it against the implementing source and update its canonical documentation and affected current specifications together

#### Scenario: Historical requirements are found
- **WHEN** an active requirement still mandates a completed release, retired configuration, superseded policy, or duplicate scenario
- **THEN** maintenance SHALL replace or consolidate it with the current general contract while retaining unique coverage and leaving archived changes and changelog history unchanged

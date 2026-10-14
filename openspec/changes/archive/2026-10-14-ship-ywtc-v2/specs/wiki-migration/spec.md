## MODIFIED Requirements

### Requirement: CLI configuration and preflight
The system SHALL expose migration through `ywtc migrate`, accept a source Wiki slug or URL and a target Confluence page ID or supported URL, validate the workdir configuration and supported deployment/authentication pair, and complete read-only capability preflight checks before creating destination content.

#### Scenario: Valid dry-run
- **WHEN** the operator supplies valid credentials, source, target, and `--dry-run`
- **THEN** the system SHALL discover and analyze the selected scope without issuing Confluence mutation requests

#### Scenario: Invalid configuration
- **WHEN** a required credential, organization identifier, URL, deployment, authentication type, source, or target is invalid
- **THEN** the system SHALL exit non-zero before vendor API mutations, identify the invalid fields and corrective action, and SHALL NOT reveal secrets

#### Scenario: Legacy direct invocation
- **WHEN** source or target flags are passed without the `migrate` subcommand
- **THEN** the system SHALL reject the invocation with v2 command guidance

### Requirement: Safe conflicts and reruns
The system SHALL use stable title suffixes for collisions, SHALL automatically select isolated resumable state under the selected workdir's `.states/` for each canonical source-target pair unless explicitly overridden, and SHALL persist enough state to resume or rerun without duplicating previously mapped content.

#### Scenario: Duplicate title
- **WHEN** a source title conflicts with another source page or an existing destination-space title
- **THEN** the system SHALL choose a deterministic suffixed title and record the rename

#### Scenario: Interrupted migration
- **WHEN** a prior current-version run created pages or attachments and then stopped
- **THEN** a rerun with the same canonical source and target SHALL find the selected workdir's `.states/<state-id>.json` and update those mapped objects instead of creating duplicates

#### Scenario: Equivalent Data Center input forms
- **WHEN** repeated Data Center runs identify the same resolved Yandex page and Confluence target through different supported slug, ID, or URL forms
- **THEN** the system SHALL preserve the existing canonical state identifier without including credentials

#### Scenario: Cloud identity
- **WHEN** a Cloud migration resolves its destination
- **THEN** its canonical state identity SHALL include deployment, Cloud instance, space ID, and target page ID to avoid collisions with Data Center or another Cloud space

#### Scenario: Independent migrations
- **WHEN** the source page, Yandex organization, Yandex instance, Confluence deployment or instance, Confluence space, or Confluence target page differs
- **THEN** the system SHALL select a different automatic state file and SHALL NOT overwrite the other migration's state

#### Scenario: Explicit state override
- **WHEN** the operator supplies a non-empty `--state` path inside the selected workdir
- **THEN** the system SHALL use exactly that resolved path and SHALL reject a valid state belonging to another source-target identity with corrective guidance

#### Scenario: Clean live run
- **WHEN** the operator supplies `--fresh` for a live migration
- **THEN** the system SHALL ignore prior mappings, preserve an existing selected state as a recoverable backup, start an empty selected state, and warn that destination duplicates or suffixed titles may result

#### Scenario: Clean dry-run
- **WHEN** the operator combines `--fresh` with `--dry-run`
- **THEN** the system SHALL analyze with empty in-memory mappings without creating, moving, backing up, or updating a state file

#### Scenario: Invalid state data
- **WHEN** a selected state file is unreadable, malformed, unsupported, outside the workdir, or owned by another migration
- **THEN** the system SHALL exit before destination mutations and identify the affected path plus safe recovery actions without revealing credentials

### Requirement: Publication hygiene
The repository and package SHALL contain only organization-neutral source, examples, specifications, and generated library artifacts and SHALL keep credentials plus automatic state, cache, and reports inside ignored selected workdirs.

#### Scenario: Public release validation
- **WHEN** a maintainer runs the release check or inspects the packed package
- **THEN** it SHALL permit ignored local workspaces but fail when runtime data is tracked, required ignore rules are absent, or publishable files contain private keys, filled credential variables, literal authorization credentials, non-example emails, internal domains, or absolute user-home paths

## ADDED Requirements

### Requirement: Deployment-specific Confluence compatibility
The system SHALL support Confluence Data Center 7.9 or newer through `/rest/api` with Bearer PAT and Confluence Cloud through REST v2 page/space APIs plus REST v1 multipart attachments with Basic email/API-token authentication.

#### Scenario: Supported Data Center
- **WHEN** `CONFLUENCE_DEPLOYMENT=data-center` and `CONFLUENCE_AUTH_TYPE=pat`
- **THEN** preflight SHALL attempt to obtain server information, reject an identified version below 7.9, and verify the REST/storage capabilities used by migration without imposing an upper version boundary; when server information is not exposed to the user, successful required capability probes SHALL permit the run with an unknown version

#### Scenario: Supported Cloud
- **WHEN** `CONFLUENCE_DEPLOYMENT=cloud`, `CONFLUENCE_AUTH_TYPE=api-token`, and an email is supplied
- **THEN** the Cloud adapter SHALL use Basic authentication, REST v2 for pages/spaces, REST v1 for attachments, and normalize responses for the common migration pipeline

#### Scenario: Unsupported Confluence profile
- **WHEN** configuration selects Confluence Server, Data Center Basic Auth, Cloud PAT, or another unsupported pair
- **THEN** validation SHALL fail before API requests with distinct deployment, version, authentication, target URL, or missing-capability diagnostics as applicable

#### Scenario: Capability drift
- **WHEN** the configured server responds but a required page, space, storage, update, or attachment contract is unavailable
- **THEN** preflight SHALL stop before destination mutations with the failed capability and compatibility guidance

### Requirement: Tolerant Yandex Wiki Public API validation
The Yandex client SHALL support Public API v1 with OAuth or IAM and `X-Org-Id` or `X-Cloud-Org-Id`, accept unknown optional response fields, and diagnose missing or invalid required page, resource, descendant, and Grid structures.

#### Scenario: Additive API change
- **WHEN** a valid Public API v1 response includes new optional fields
- **THEN** the client SHALL accept the response and continue using the required normalized fields

#### Scenario: Required structure missing
- **WHEN** a page, descendant, resource, or Grid response lacks a required structure
- **THEN** the client SHALL report the endpoint and schema problem without logging authorization data


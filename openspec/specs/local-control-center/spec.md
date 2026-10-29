# local-control-center Specification

## Purpose
Provide a private local operator application for configuration, durable jobs, migration evidence and explicit corrective actions.

## Requirements

### Requirement: Packaged loopback application
The CLI SHALL expose ui with workdir, port default 3000 and no-open, serve only 127.0.0.1, open the browser by default and report an occupied port without stopping another process. Closing the application SHALL NOT stop accepted jobs.

#### Scenario: Installed application starts
- **WHEN** ui starts from the installed package
- **THEN** all required UI assets SHALL be local, configuration defaults SHALL match CLI, and ordinary CLI commands SHALL NOT load the web runtime

### Requirement: Authenticated local access
The application SHALL exchange a single-use fragment bootstrap secret for an HttpOnly SameSite session, validate Host/Origin, deny CORS and keep credentials out of browser responses, logs and persisted job requests.

#### Scenario: Untrusted browser origin sends a request
- **WHEN** an untrusted origin or invalid session accesses the application API
- **THEN** the request SHALL be rejected without revealing workspace contents or causing mutation

### Requirement: Explicit filesystem and preview boundaries
Only registered workspaces and explicitly selected export roots SHALL be accessible through realpath-aware bounded routes. Source markup and historical report applications SHALL NOT execute in the control-center origin.

#### Scenario: Imported content or path is unsafe
- **WHEN** a request contains traversal, a symlink escape or executable preview content
- **THEN** the path SHALL be rejected or the preview isolated without changing provider or application data

### Requirement: Operator workflows
The application SHALL expose workspace/profile setup, dry-run-first migration, task queue/progress/logs, state-grouped run history, read-only mappings/checkpoints, report hierarchy/details and decisions workflows with compact nonzero presentation, RU/EN, themes, keyboard access and large-list virtualization.

#### Scenario: Existing evidence is inspected
- **WHEN** an operator opens an old or incomplete report/state
- **THEN** available evidence SHALL remain readable, missing capabilities SHALL have precise reasons, and no guessed retry parameters or false success SHALL be produced

#### Scenario: Live mutation is requested
- **WHEN** an operator starts a live migration or selective correction
- **THEN** it SHALL require explicit confirmation, preserve dry-run's no-destination-write boundary and expose the final shared report

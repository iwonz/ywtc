## Context

The implementation talks to Yandex Wiki through the versioned `/v1` public API and to Confluence through the Data Center `/rest/api` content and attachment endpoints using storage-format bodies and a Bearer PAT. Atlassian introduced Confluence PATs in 7.9, while the same REST family remains documented for the current Confluence Data Center 10.2 line. The existing one-line README introduction exposes only the lower bound and does not explain the distinction between API compatibility, vendor lifecycle support, and live-version certification.

## Goals / Non-Goals

**Goals:**

- Make the introduction product-focused rather than appearing pinned to Confluence 7.9.
- State the exact Yandex Wiki API generation and current Confluence Data Center range the project targets.
- Explain why 7.9 is the minimum and why future major versions are not automatically claimed.
- Distinguish Data Center, Server, and Cloud so an operator can make an immediate compatibility decision.
- Be transparent that automated coverage uses mocked vendor contracts rather than a live installation matrix.

**Non-Goals:**

- Adding Confluence Cloud, Basic authentication, or legacy pre-7.9 support.
- Claiming vendor lifecycle support for old Confluence releases.
- Changing retries, resume, conflicts, content degradation, credentials, or runtime behavior.

## Decisions

- Add a compact compatibility table immediately after the introduction because this information must be visible before credential setup or installation.
- Describe Yandex Wiki as Public API v1. Yandex Wiki is hosted and its public contract is versioned by the API base path, not by an operator-installed product release.
- Declare Confluence Data Center 7.9 through 10.2.x as the currently documented compatibility range, last reviewed on 2026-10-14. Version 7.9 is the lower bound because PAT Bearer authentication was introduced there; 10.2 is the current documented Data Center line and still exposes the REST contract used by the client.
- Mark Confluence Server and Confluence Cloud as outside the supported target. Similar endpoints are not enough to promise compatibility because lifecycle, authentication, and Cloud API behavior differ.
- State that API compatibility does not override Atlassian's product-support lifecycle and recommend `--dry-run` for every real installation and for any future major release.

## Risks / Trade-offs

- [The upper bound becomes stale when Atlassian ships a new major line] → Include a review date and explicitly classify future majors as unverified until the matrix is updated.
- [“Supported” can imply live certification of every patch] → Define support as the vendor-documented API contract plus automated mocked integration coverage, not a live-version certification matrix.
- [Listing 7.9 may encourage use of an obsolete release] → Separate tool compatibility from vendor lifecycle and direct operators to use a vendor-supported patch level.

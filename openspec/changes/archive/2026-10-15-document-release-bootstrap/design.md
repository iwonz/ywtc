## Context

`@iwonz/ywtc` does not yet exist in npm. The bootstrap helper creates only version `0.0.0`, after which npm trusted publishing can bind the GitHub workflow. Release Please also requires the repository option that permits Actions to create pull requests.

## Decisions

- Keep operator installation requirements at npm 11.5.1, while requiring npm 11.15+ only for maintainers invoking `npm trust`.
- Document commands with no OTP, token, or credential values.
- Explicitly warn that the GitHub setting also permits approval when a workflow receives suitable scoped permissions.

## Risks / Trade-offs

- Registry and repository policy can change. Link to official npm documentation and keep commands covered by the release contract.

## Migration Plan

Add the checklist, validate documentation and specifications, archive the change, and publish a docs-only Conventional Commit.

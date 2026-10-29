# Design

## Context

See proposal.md. npm 12's libnpmpack rejects bundles with root override edges (EBUNDLEOVERRIDE). Root overrides are not consumer policy. Publishable shrinkwrap is no longer emitted by npm 12 in the tested artifact, so it does not preserve the CSS substitution. A private staging prototype with exact resolved bundled manifests packs and installs under npm 12, retaining the maintained CSS parser.

## Goals / Non-Goals

Keep audited runtime bytes and valid consumer manifests without changing the source checkout. No renderer rewrite, npm downgrade, validation bypass, provider calls, state changes, retry/outcome changes or release tag movement.

## Decisions

- Use the existing lockfile's inBundle entries as the audited closure. Require every entry to exist at its safe installed path with the locked version. Copy intended publication files and those package directories, excluding nested node_modules during each copy because the closure reconstructs their original topology.
- Resolve dependency/optional/peer bindings from the installed tree. Pin manifest edges to resolved exact versions or npm aliases; preserve dependency source and licenses. Required unavailable edges fail; absent optional peers stay optional. Remove overrides only from staging manifests, where consumers would ignore them.
- Isolate the complete renderer snapshot under its bundled package's runtime directory, preserving original node_modules topology. Hoisted copies at the application root collide with npm's resolution of unrelated Next.js/CLI dependencies; the isolated snapshot passes npm 12 global dependency validation. A package entry points to the original implementation inside the snapshot, and generated CommonJS lib forwarders preserve shared logger/subpath identity. Original implementation bytes, declarations, assets and licenses remain in the snapshot; no global loader change or runtime extraction is added.
- Share the staging builder between package validation and workflow packing. Run npm pack on staging with scripts disabled after the existing complete build/check; always clean staging. Expose package:pack for maintainers and retain trusted OIDC/provenance/checksum gates.
- Recovery loads the current verifier and both shared packer files together, restores or removes temporary trusted-tool copies before packing, and runs the trusted external packer against unchanged tagged source.
- Verify source immutability, closure topology/aliases, missing or mismatched dependencies, traversal and preservation of unrelated packages with neutral fixtures. Actual npm 11 and npm 12 installed-package tests remain authoritative.
- Installed smoke additionally runs npm ls over the consumer tree, rejecting invalid or missing dependencies before publication.
- Publish a normal follow-up patch because 5.4.1's immutable tag already exists. Do not claim its failed npm publication succeeded.

## Risks / Trade-offs

Bundled metadata describes the tested override result rather than upstream declared ranges; dependency implementation bytes and license notices remain intact. A stale installed tree must be repaired with npm ci, not accepted silently. Platform-specific optional modules require their existing npm semantics; renderer closure is verified on Linux and macOS.

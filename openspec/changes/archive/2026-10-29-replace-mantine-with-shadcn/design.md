# Design

## Context

See proposal.md. Three frontend builds share React but currently import Mantine separately. Next.js serves authenticated loopback operations; Vite produces autonomous report and decision HTML. Existing CSP, isolated previews, virtualization, job/retry/sync semantics and JSON contracts must remain intact.

## Goals / Non-Goals

**Goals:** Use locally owned shadcn/ui primitives with a shared theme and consistent interaction behavior across every operator interface. Preserve flat composition and informative semantic status colors.

**Non-Goals:** No migration, provider, discovery, resume, identity or retry-policy changes; no real provider writes. Static exported page content is not an operator interface and retains its own presentation.

## Decisions

- Vendor the official shadcn Radix components in a shared `ui` source directory, with CVA, class merging and Tailwind-generated CSS. Keep source and provenance reviewable. Do not create a Mantine-compatible facade or retain Mantine hooks/providers.
- Migrate screen markup to semantic HTML for layout/typography and shadcn primitives for controls. Small shared compositions may associate labels/errors, accessible dialogs and pagination with those primitives.
- Compile the same semantic CSS tokens for Next.js and both single-file applications. All fonts, scripts, styles and icons remain local. Themes use the root dark class and safe persisted preferences; system changes are observed and missing storage is tolerated.
- Preserve strict host/session/CSRF protections, nonce-bound Next scripts and sandboxed report previews. Radix portals provide focus management and Escape; all icon controls retain accessible names. Keep source markup escaped.
- Remove Mantine packages, selectors, CSS variables and terminology from current sources/docs/specifications. Historical archives remain untouched. Shared frontend sources must participate in TypeScript, Biome, Knip and package checks.
- Preserve data and execution semantics: outcomes, transformation quality, retryability, run results and exit codes are unchanged. Existing state, retries, identity ambiguity checks and decision mapping remain owned by the core.
- The final audit surfaced GHSA-qr28-fpjm-wq7f in Diplodoc's legacy `css`/`source-map-resolve` chain. A direct override to decoder 0.5.1 would break the CommonJS function API because that release is ESM. Override only Diplodoc's `css` dependency with the maintained Adobe CSS fork, whose CommonJS bundle explicitly provides both named and default `parse`/`stringify`. Keep golden CSS output and bounded malformed-percent coverage, and repeat all rendering tests and audit. Do not suppress the advisory or change the audit threshold.
- Published dependency overrides do not propagate to consumers: an isolated global install proved it still resolved legacy CSS. Bundle the audited Diplodoc dependency subtree using npm's supported bundleDependencies mechanism and assert the actual installed CSS implementation and CommonJS API in package verification. This increases package size but avoids a root-only security fix; frontend dependencies remain compiled locally and ordinary CLI loading is unchanged.

## Risks / Trade-offs

- Portals and native/select semantics differ → browser tests cover selection, nested dialogs, focus return, tabs, keyboard and stale confirmation behavior.
- Tailwind detection across three roots → explicit shared source registration and production builds for every bundle, including the installed tarball.
- Changed visual metrics affect virtualization/mobile → measured rows, large fixtures, overflow checks and reviewed snapshots in both themes.
- Stale historical reports → existing HTML is not rewritten; only newly generated reports/editors and the installed control center use shadcn.

## Migration Plan

Replace the component system in one audited change, run complete checks, archive and publish a patch because behavior/contracts are preserved. Reverting the feature commit restores the previous presentation without changing runtime data. Release Please controls the actual version; no manual tags or runtime migrations.

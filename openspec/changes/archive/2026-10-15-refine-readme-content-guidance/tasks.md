# Tasks

## 1. Content support documentation

- [x] 1.1 Replace the mixed feature table with a detailed supported-content table covering hierarchy, styles, tables/code, links/anchors, API-downloadable attachments, images, provider constructs, native equivalents, and fallback behavior; verify every claim against current renderer and resource behavior.
- [x] 1.2 Add an adjacent `Не переносится` table that distinguishes excluded metadata and inaccessible content from static fallbacks, external references, and raw snapshots; verify no existing runtime guarantee is overstated.

## 2. Frequent command examples

- [x] 2.1 Reduce `Частые примеры` to the common default transfer, linked traversal, single-page transfer, HTML export, and latest-report commands; verify defaults and automatic profile selection remove every unnecessary option.
- [x] 2.2 Verify less-common directions, Markdown, workdir, state, fresh-run, and source-status behavior remain discoverable in the existing compatibility, parameter, export, state, and report sections without duplicated commands.

## 3. Quality verification

- [x] 3.1 Verify the 13 approved second-level README headings and their order remain unchanged, run `npm run check`, and confirm release hygiene excludes runtime or organization-specific data.

## Workflow follow-up

- Archive `refine-readme-content-guidance`, run strict OpenSpec validation again, and commit/push the documentation change with a Conventional Commit that does not trigger a product release.

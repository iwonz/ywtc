import {createHash, randomUUID} from 'node:crypto';
import {createWriteStream} from 'node:fs';
import {access, cp, mkdir, readFile, readdir, rename, rm, rmdir, stat, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pipeline} from 'node:stream/promises';
import {ZipArchive} from '@archiver/archiver';
import PQueue from 'p-queue';
import {z} from 'zod';
import {appendGridSnapshots, normalizePageContent, renderMarkdown, renderStaticHtml, setSourceResourceBinding, sourceResourceBindings} from './content-model.js';
import {commentAttachmentUses, createCommentArchiveZip, renderCommentArchive} from './comments.js';
import type {CommentInventory, ExportFormat, PageGraph, RenderContext, RenderResourceBinding, SourceAdapter, SourcePage, SourceResource} from './domain.js';
import type {CommentTransferStatus} from './state.js';
import {DestinationNameAllocator, preferredDestinationName, verifiedCacheFile} from './resource-reconciliation.js';
import {acquireExclusiveLease} from './exclusive-lease.js';

export interface ExportManifestPage {
  sourceCanonicalId: string;
  sourceUrl: string;
  title: string;
  path: string;
  parentId?: string;
  resources: Array<{sourceId?: string; name: string; path: string; size?: number; sha256?: string}>;
  degraded: boolean;
  warnings: string[];
  adaptations: string[];
  preservedExternalReferences: number;
  comments: {
    status: CommentTransferStatus;
    threads: number;
    comments: number;
    participants: number;
    attachments: number;
    bytes: number;
    fingerprint?: string;
    archiveName?: string;
    archivePath?: string;
    error?: string;
  };
}

export interface ExportManifest {
  tool: 'ywtc';
  identity: string;
  format: ExportFormat;
  generatedAt: string;
  rootId: string;
  pages: ExportManifestPage[];
}

const manifestPageSchema = z.object({
  sourceCanonicalId: z.string(),
  sourceUrl: z.string(),
  title: z.string(),
  path: z.string(),
  parentId: z.string().optional(),
  resources: z.array(z.object({
    sourceId: z.string().optional(),
    name: z.string(),
    path: z.string(),
    size: z.number().nonnegative().optional(),
    sha256: z.string().optional(),
  }).strict()),
  degraded: z.boolean(),
  warnings: z.array(z.string()),
  adaptations: z.array(z.string()),
  preservedExternalReferences: z.number().int().nonnegative(),
  comments: z.object({
    status: z.enum(['planned', 'complete', 'partial', 'failed', 'conflict', 'stale', 'skipped']),
    threads: z.number().int().nonnegative(),
    comments: z.number().int().nonnegative(),
    participants: z.number().int().nonnegative(),
    attachments: z.number().int().nonnegative(),
    bytes: z.number().int().nonnegative(),
    fingerprint: z.string().optional(),
    archiveName: z.string().optional(),
    archivePath: z.string().optional(),
    error: z.string().optional(),
  }).strict(),
}).strict();

const exportManifestSchema = z.object({
  tool: z.literal('ywtc'),
  identity: z.string(),
  format: z.enum(['markdown', 'html']),
  generatedAt: z.string(),
  rootId: z.string(),
  pages: z.array(manifestPageSchema),
}).strict();

export interface FilesystemExportResult {
  directory: string;
  mode: 'planned' | 'patched' | 'rebuilt';
  archive?: string;
  backup?: string;
  manifest: ExportManifest;
  warnings: string[];
  errors: string[];
}

function stableSegment(page: SourcePage): string {
  const title = page.title.normalize('NFKD').toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'page';
  const suffix = createHash('sha256').update(page.canonicalId).digest('hex').slice(0, 8);
  return `${title}-${suffix}`;
}

function pagePath(page: SourcePage, format: ExportFormat, rootId: string): string {
  if (page.canonicalId === rootId) return format === 'html' ? 'index.html' : 'index.md';
  return format === 'html' ? `pages/${stableSegment(page)}/index.html` : `pages/${stableSegment(page)}.md`;
}

function htmlPage(title: string, navigation: string, body: string, cssPath: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title.replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</title><link rel="stylesheet" href="${cssPath}"></head><body><aside class="nav"><a class="brand" href="${cssPath.replace(/assets\/site\.css$/, 'index.html')}">ywtc export</a>${navigation}</aside><main><h1>${title.replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</h1>${body}</main></body></html>`;
}

const SITE_CSS = `:root{font:16px/1.55 system-ui,sans-serif;color:#172033;background:#f4f6fa}*{box-sizing:border-box}body{margin:0;display:grid;grid-template-columns:minmax(220px,300px) 1fr;min-height:100vh}.nav{padding:24px;background:#111827;color:#dbe4f3;overflow:auto}.nav a{color:#dbe4f3;text-decoration:none}.nav a[aria-current=page]{color:#fff;font-weight:700}.nav ul{list-style:none;padding-left:16px}.brand{display:block;font-weight:700;margin-bottom:20px}main{max-width:1100px;width:100%;padding:40px;margin:0 auto;background:#fff}img{max-width:100%;height:auto}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccd5e2;padding:8px;text-align:left}pre{overflow:auto;background:#111827;color:#f8fafc;padding:16px;border-radius:8px}aside[class^=ywtc-]{border-left:4px solid #526dcf;background:#f2f5ff;padding:12px;margin:16px 0}.ywtc-fallback{border-color:#d59b24}.ywtc-layout{display:grid;gap:24px;margin:18px 0}.ywtc-layout-section{display:grid;grid-template-columns:repeat(var(--ywtc-columns,1),minmax(0,1fr));gap:24px;align-items:start}.ywtc-layout-columns-2{--ywtc-columns:2}.ywtc-layout-columns-3{--ywtc-columns:3}.ywtc-layout-gap-s{gap:12px}.ywtc-layout-gap-m{gap:18px}.ywtc-layout-gap-l{gap:28px}.ywtc-layout-cell{min-width:0}@media(max-width:760px){body{display:block}.nav{position:relative}main{padding:22px}.ywtc-layout-section{grid-template-columns:1fr}}`;

function relativeHref(from: string, to: string): string {
  const base = path.posix.dirname(from);
  const result = path.posix.relative(base, to);
  return result || path.posix.basename(to);
}

async function exists(filename: string): Promise<boolean> {
  try { await access(filename); return true; } catch { return false; }
}

async function readManagedManifest(directory: string, identity: string): Promise<ExportManifest | undefined> {
  try {
    const parsed = exportManifestSchema.safeParse(JSON.parse(await readFile(path.join(directory, '.ywtc-export.json'), 'utf8')));
    return parsed.success && parsed.data.identity === identity
      ? parsed.data as unknown as ExportManifest
      : undefined;
  } catch {
    return undefined;
  }
}

async function managedManifest(directory: string, identity: string): Promise<boolean> {
  return Boolean(await readManagedManifest(directory, identity));
}

function manifestMatchesGraph(
  manifest: ExportManifest,
  graph: PageGraph,
  pagePaths: ReadonlyMap<string, string>,
): boolean {
  if (manifest.pages.length !== graph.pages.length) return false;
  const pages = new Map(manifest.pages.map((page) => [page.sourceCanonicalId, page]));
  return graph.pages.every((page) => {
    const previous = pages.get(page.canonicalId);
    return previous?.title === page.title
      && previous.path === pagePaths.get(page.canonicalId)
      && previous.parentId === page.projectedParentId;
  });
}

function containedPath(root: string, candidate: string): string | undefined {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(root, candidate);
  const relative = path.relative(resolvedRoot, resolved);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
    ? resolved
    : undefined;
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function createArchive(directory: string): Promise<string> {
  const destination = `${directory}-${timestamp()}-${randomUUID().slice(0, 8)}.zip`;
  const archive = new ZipArchive({zlib: {level: 9}});
  archive.directory(directory, path.basename(directory));
  const output = createWriteStream(destination, {flags: 'wx', mode: 0o600});
  const piping = pipeline(archive, output);
  await archive.finalize();
  await piping;
  return destination;
}

async function verifyGeneratedTree(directory: string, manifest: ExportManifest): Promise<void> {
  const expected = [
    '.ywtc-export.json',
    ...(manifest.format === 'html' ? ['assets/site.css'] : []),
    ...manifest.pages.flatMap((page) => [page.path, ...page.resources.map((resource) => resource.path)]),
    ...manifest.pages.flatMap((page) => page.comments.archivePath ? [page.comments.archivePath] : []),
  ];
  await Promise.all(expected.map((relative) => access(path.join(directory, relative))));
  for (const page of manifest.pages) {
    const filename = path.join(directory, page.path);
    const content = await readFile(filename, 'utf8');
    const references = manifest.format === 'html'
      ? [...content.matchAll(/(?:href|src)=["']([^"']+)["']/g)].map((match) => match[1]!)
      : [...content.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g)].map((match) => match[1]!);
    for (const reference of references) {
      if (/^(?:https?:|mailto:|tel:|data:|#)/i.test(reference)) continue;
      const clean = decodeURIComponent(reference.split(/[?#]/, 1)[0] ?? '');
      if (!clean) continue;
      const target = path.resolve(path.dirname(filename), clean);
      const relative = path.relative(directory, target);
      if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        throw new Error(`Generated reference escapes the export directory: ${page.path} → ${reference}`);
      }
      await access(target);
    }
  }
}

export class FilesystemExporter {
  constructor(private readonly source: SourceAdapter, private readonly concurrency: number) {}

  async export(input: {
    graph: PageGraph;
    directory: string;
    format: ExportFormat;
    identity: string;
    archive: boolean;
    dryRun: boolean;
    cacheDirectory: string;
    signal?: AbortSignal;
    onActivity?: (message: string) => void;
    onItem?: (message: string) => void;
    resourcesByPage?: Map<string, SourceResource[]>;
    commentsByPage?: Map<string, CommentInventory>;
    commentsEnabled?: boolean;
    retryPageIds?: ReadonlySet<string>;
    retryResourceIds?: ReadonlyMap<string, ReadonlySet<string>>;
    loadPage?: (page: SourcePage) => Promise<SourcePage>;
    loadDocument?: (page: SourcePage) => Promise<ReturnType<typeof normalizePageContent>>;
  }): Promise<FilesystemExportResult> {
    const warnings = [...input.graph.warnings];
    const errors: string[] = [];
    const pagePaths = new Map(input.graph.pages.map((page) => [page.canonicalId, pagePath(page, input.format, input.graph.rootId)]));
    const manifest: ExportManifest = {
      tool: 'ywtc',
      identity: input.identity,
      format: input.format,
      generatedAt: new Date().toISOString(),
      rootId: input.graph.rootId,
      pages: [],
    };
    if (input.dryRun) {
      manifest.pages = input.graph.pages.map((page) => ({
        sourceCanonicalId: page.canonicalId,
        sourceUrl: page.url,
        title: page.title,
        path: pagePaths.get(page.canonicalId)!,
        ...(page.projectedParentId ? {parentId: page.projectedParentId} : {}),
        resources: [],
        degraded: false,
        warnings: [],
        adaptations: [],
        preservedExternalReferences: 0,
        comments: {
          status: input.commentsEnabled === false ? 'skipped' : 'planned',
          threads: input.commentsByPage?.get(page.canonicalId)?.threads.length ?? 0,
          comments: input.commentsByPage?.get(page.canonicalId)?.comments ?? 0,
          participants: input.commentsByPage?.get(page.canonicalId)?.participants ?? 0,
          attachments: input.commentsByPage?.get(page.canonicalId)?.attachments ?? 0,
          bytes: input.commentsByPage?.get(page.canonicalId)?.knownBytes ?? 0,
          ...(input.commentsByPage?.get(page.canonicalId)?.fingerprint ? {fingerprint: input.commentsByPage.get(page.canonicalId)!.fingerprint} : {}),
        },
      }));
      return {directory: input.directory, mode: 'planned', manifest, warnings, errors};
    }

    const lease = await acquireExclusiveLease(`${input.directory}.ywtc.lock`, 'ywtc filesystem export', input.directory);
    try {
    const parent = path.dirname(input.directory);
    const staging = path.join(parent, `.${path.basename(input.directory)}.ywtc-staging-${randomUUID().slice(0, 8)}`);
    await mkdir(parent, {recursive: true, mode: 0o700});
    const previousManifest = input.retryPageIds && await exists(input.directory)
      ? await readManagedManifest(input.directory, input.identity)
      : undefined;
    const patchExisting = previousManifest?.format === input.format
      && previousManifest.rootId === input.graph.rootId
      && manifestMatchesGraph(previousManifest, input.graph, pagePaths);
    if (patchExisting) {
      await cp(input.directory, staging, {recursive: true, errorOnExist: true});
      manifest.pages = structuredClone(previousManifest.pages);
      for (const previous of previousManifest.pages) {
        if (pagePaths.has(previous.sourceCanonicalId)) pagePaths.set(previous.sourceCanonicalId, previous.path);
      }
      input.onItem?.(`reusing managed export; ${input.retryPageIds!.size} page payload(s) selected`);
    } else {
      await mkdir(staging, {recursive: false, mode: 0o700});
      if (input.retryPageIds) input.onItem?.('managed export unavailable; rebuilding the complete site safely');
    }
    let backup: string | undefined;
    try {
      const sourcePages = new Map(input.graph.pages.map((page) => [page.canonicalId, page]));
      const pagesToProcess = patchExisting
        ? input.graph.pages.filter((page) => input.retryPageIds!.has(page.canonicalId))
        : input.graph.pages;
      if (patchExisting) {
        const selected = input.retryPageIds!;
        manifest.pages = manifest.pages.filter((page) => !selected.has(page.sourceCanonicalId));
      }
      const queue = new PQueue({concurrency: this.concurrency});
      const resourceMapByPage = new Map<string, Map<string, RenderResourceBinding>>();
      const resourcesByPage = new Map<string, SourceResource[]>();
      const commentBodies = new Map<string, string>();

      await Promise.all(pagesToProcess.map((page) => queue.add(async () => {
        if (input.signal?.aborted) throw input.signal.reason ?? new Error('Export cancelled');
        input.onActivity?.(`Preparing export page · ${page.title}`);
        const resources = input.resourcesByPage?.get(page.canonicalId) ?? await this.source.listResources(page);
        resourcesByPage.set(page.canonicalId, resources);
        const pageResources = sourceResourceBindings(page, resources);
        const nameAllocator = new DestinationNameAllocator();
        const manifestResources: ExportManifestPage['resources'] = [];
        const downloadedByResource = new Map<string, {path: string; size: number; sha256: string}>();
        const transferableResources = resources.filter((item) => item.kind !== 'grid');
        const previousPage = previousManifest?.pages.find((candidate) => candidate.sourceCanonicalId === page.canonicalId);
        const targetedResourceIds = input.retryResourceIds?.get(page.canonicalId);
        for (const [resourceIndex, resource] of transferableResources.entries()) {
          const previousResource = previousPage?.resources.find((candidate) => candidate.sourceId === resource.id)
            ?? previousPage?.resources.find((candidate) => !candidate.sourceId && candidate.name === preferredDestinationName(resource))
            ?? (previousPage?.resources.length === transferableResources.length ? previousPage.resources[resourceIndex] : undefined);
          const previousPath = previousResource && containedPath(staging, previousResource.path);
          const reusable = patchExisting
            && !targetedResourceIds?.has(resource.id)
            && previousResource
            && previousPath
            ? await verifiedCacheFile(previousPath, previousResource.sha256 ? {
              sha256: previousResource.sha256,
              ...(previousResource.size !== undefined ? {size: previousResource.size} : {}),
            } : undefined)
            : undefined;
          if (reusable) {
            setSourceResourceBinding(pageResources, page, resources, resource, {
              kind: 'file', path: previousResource!.path, name: previousResource!.name,
            });
            manifestResources.push({...previousResource!, sourceId: resource.id, size: reusable.size, sha256: reusable.sha256});
            downloadedByResource.set(resource.id, reusable);
            continue;
          }
          const name = nameAllocator.allocate(resource);
          input.onActivity?.(`Downloading ${name} → ${page.title}`);
          const relative = `attachments/${stableSegment(page)}/${name}`;
          const destination = path.join(staging, relative);
          await mkdir(path.dirname(destination), {recursive: true});
          const downloaded = await this.source.downloadResource(resource, destination);
          downloadedByResource.set(resource.id, downloaded);
          setSourceResourceBinding(pageResources, page, resources, resource, {kind: 'file', path: relative, name});
          manifestResources.push({sourceId: resource.id, name, path: relative, size: downloaded.size, sha256: downloaded.sha256});
          input.onItem?.(`attachment ${name}`);
        }
        resourceMapByPage.set(page.canonicalId, pageResources);
        const inventory = input.commentsByPage?.get(page.canonicalId);
        let comments: ExportManifestPage['comments'] = {
          status: input.commentsEnabled === false ? 'skipped' : inventory?.status === 'failed' ? 'failed' : 'complete',
          threads: inventory?.threads.length ?? 0,
          comments: inventory?.comments ?? 0,
          participants: inventory?.participants ?? 0,
          attachments: inventory?.attachments ?? 0,
          bytes: inventory?.knownBytes ?? 0,
          ...(inventory?.fingerprint ? {fingerprint: inventory.fingerprint} : {}),
          ...(inventory?.error ? {error: inventory.error} : {}),
        };
        if (input.commentsEnabled !== false && inventory?.status === 'complete' && inventory.fingerprint) {
          try {
            const resourceById = new Map(resources.map((resource) => [resource.id, resource]));
            const files = commentAttachmentUses(inventory).flatMap((use) => {
              const id = use.reference.resourceId;
              const resource = id ? resourceById.get(id) : undefined;
              const downloaded = id ? downloadedByResource.get(id) : undefined;
              return resource && downloaded ? [{
                commentId: use.commentId,
                reference: use.reference.href,
                originalName: resource.preferredName ?? resource.name,
                ...downloaded,
              }] : [];
            });
            const zip = await createCommentArchiveZip({
              pageKey: page.id,
              fingerprint: inventory.fingerprint,
              files,
              destinationDirectory: path.join(staging, 'attachments', stableSegment(page)),
            });
            const archivePath = zip ? path.relative(staging, zip.path).split(path.sep).join('/') : undefined;
            const names = new Map<string, string>();
            if (zip) {
              const byHash = new Map(zip.files.map((entry) => [entry.sha256, entry.archiveName]));
              for (const [resourceId, downloaded] of downloadedByResource) {
                const name = byHash.get(downloaded.sha256);
                if (name) names.set(resourceId, name);
              }
            }
            const pageFile = pagePaths.get(page.canonicalId)!;
            commentBodies.set(page.canonicalId, renderCommentArchive(inventory, input.format, {
              sourceUrl: page.url,
              ...(zip && archivePath ? {archiveName: zip.name, archiveHref: relativeHref(pageFile, archivePath)} : {}),
              attachmentNames: names,
            }));
            comments = {
              ...comments,
              status: inventory.warnings.length ? 'partial' : 'complete',
              ...(zip && archivePath ? {archiveName: zip.name, archivePath, bytes: zip.size} : {}),
              ...(inventory.warnings.length ? {error: inventory.warnings.join('; ')} : {}),
            };
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            comments = {...comments, status: 'failed', error: message};
          }
        }
        manifest.pages.push({
          sourceCanonicalId: page.canonicalId,
          sourceUrl: page.url,
          title: page.title,
          path: pagePaths.get(page.canonicalId)!,
          ...(page.projectedParentId ? {parentId: page.projectedParentId} : {}),
          resources: manifestResources,
          degraded: false,
          warnings: [],
          adaptations: [],
          preservedExternalReferences: 0,
          comments,
        });
      })));

      const children = new Map<string, SourcePage[]>();
      for (const page of input.graph.pages) {
        const parentId = page.projectedParentId ?? '__root__';
        const siblings = children.get(parentId) ?? [];
        siblings.push(page);
        children.set(parentId, siblings);
      }
      const navigationFor = (currentPath: string): string => {
        const renderItems = (parentId: string): string => `<ul>${(children.get(parentId) ?? []).map((page) => {
          const pageFile = pagePaths.get(page.canonicalId)!;
          const active = pageFile === currentPath ? ' aria-current="page"' : '';
          const title = page.title.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
          return `<li><a${active} href="${relativeHref(currentPath, pageFile)}">${title}</a>${renderItems(page.canonicalId)}</li>`;
        }).join('')}</ul>`;
        return renderItems('__root__');
      };
      for (const page of pagesToProcess) {
        input.onActivity?.(`Rendering export page · ${page.title}`);
        const fullPage = input.loadPage ? await input.loadPage(page) : page;
        const relative = pagePaths.get(page.canonicalId)!;
        const resources = resourcesByPage.get(page.canonicalId) ?? [];
        const document = input.loadDocument
          ? await input.loadDocument(page)
          : appendGridSnapshots(normalizePageContent(fullPage), resources);
        const pages = new Map([...pagePaths].map(([id, file]) => [id, {path: file, title: sourcePages.get(id)?.title ?? id}]));
        const context: RenderContext = {
          pages,
          resources: resourceMapByPage.get(page.canonicalId) ?? new Map(),
          sourcePages,
          currentPageId: page.canonicalId,
          currentPath: relative,
        };
        const rendered = input.format === 'html' ? await renderStaticHtml(document, context) : await renderMarkdown(document, context);
        const output = input.format === 'html'
          ? htmlPage(page.title, navigationFor(relative), `${rendered.body}${commentBodies.get(page.canonicalId) ?? ''}`, relativeHref(relative, 'assets/site.css'))
          : `# ${page.title}\n\n${rendered.body}${commentBodies.has(page.canonicalId) ? `\n\n## Комментарии\n\n${commentBodies.get(page.canonicalId)}` : ''}`;
        await mkdir(path.dirname(path.join(staging, relative)), {recursive: true});
        await writeFile(path.join(staging, relative), output, {mode: 0o600});
        const manifestPage = manifest.pages.find((item) => item.sourceCanonicalId === page.canonicalId)!;
        manifestPage.degraded = rendered.notices.some((notice) => notice.kind === 'degradation');
        manifestPage.warnings.push(...rendered.warnings);
        manifestPage.adaptations.push(...rendered.adaptations);
        manifestPage.preservedExternalReferences = rendered.preservedExternalReferences;
        warnings.push(...rendered.warnings.map((warning) => `${page.title}: ${warning}`));
        if (manifestPage.degraded) {
          const snapshot = `_source/${stableSegment(page)}.${page.rawFormat === 'yfm' ? 'yfm' : 'storage.xml'}`;
          await mkdir(path.dirname(path.join(staging, snapshot)), {recursive: true});
          await writeFile(path.join(staging, snapshot), fullPage.rawContent, {mode: 0o600});
        }
        input.onItem?.(`page ${page.title}`);
      }
      manifest.pages.sort((left, right) => left.path.localeCompare(right.path));
      if (input.format === 'html') {
        await mkdir(path.join(staging, 'assets'), {recursive: true});
        await writeFile(path.join(staging, 'assets/site.css'), SITE_CSS, {mode: 0o600});
      }
      await writeFile(path.join(staging, '.ywtc-export.json'), `${JSON.stringify(manifest, null, 2)}\n`, {mode: 0o600});
      input.onActivity?.('Verifying generated export tree');
      await verifyGeneratedTree(staging, manifest);

      if (await exists(input.directory)) {
        const selected = await stat(input.directory);
        const empty = selected.isDirectory() && (await readdir(input.directory)).length === 0;
        if (!selected.isDirectory() || (!empty && !(await managedManifest(input.directory, input.identity)))) {
          throw new Error(`Refusing to replace unmanaged destination "${input.directory}". Choose an empty path or a directory with a matching .ywtc-export.json.`);
        }
        if (empty) {
          await rmdir(input.directory);
        } else {
          backup = `${input.directory}.backup-${timestamp()}`;
          await rename(input.directory, backup);
        }
      }
      try {
        await rename(staging, input.directory);
      } catch (error) {
        if (backup && !(await exists(input.directory))) await rename(backup, input.directory);
        throw error;
      }
      const archive = input.archive ? await createArchive(input.directory) : undefined;
      return {
        directory: input.directory,
        mode: patchExisting ? 'patched' : 'rebuilt',
        ...(archive ? {archive} : {}),
        ...(backup ? {backup} : {}),
        manifest,
        warnings,
        errors,
      };
    } catch (error) {
      await rm(staging, {recursive: true, force: true});
      throw error;
    }
    } finally {
      await lease.release();
    }
  }
}

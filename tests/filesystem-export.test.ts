import {createHash} from 'node:crypto';
import {mkdir, mkdtemp, readFile, readdir, stat, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {normalizeCommentForest, resolveCommentAttachmentReferences} from '../src/comments.js';
import type {PageGraph, SourceAdapter, SourcePage, SourceResource} from '../src/domain.js';
import {FilesystemExporter} from '../src/filesystem-export.js';

const root: SourcePage & {depth: number} = {
  provider: 'yandex-wiki', profile: 'wiki', id: '1', canonicalId: 'wiki:1', title: 'Root', locator: 'root',
  url: 'https://wiki.example.com/root', rawContent: '# Root\n\n[Child](/child)\n\n![Image](image.png)', rawFormat: 'yfm',
  references: [{raw: '/child', href: '/child', kind: 'page'}, {raw: 'image.png', href: 'image.png', kind: 'attachment'}], depth: 0,
};
const child: SourcePage & {depth: number; projectedParentId: string} = {
  ...root, id: '2', canonicalId: 'wiki:2', title: 'Child', locator: 'child', url: 'https://wiki.example.com/child',
  rawContent: 'Child body', references: [], depth: 1, projectedParentId: 'wiki:1',
};
const selection = {requestedStatus: 'all' as const, effectiveStatus: 'all' as const, returnedDescendants: 1, selectedDescendants: 1, excluded: [], maximumDepth: 1, hierarchyGaps: [], notes: []};
const graph: PageGraph = {rootId: root.canonicalId, pages: [root, child], edges: [{from: root.canonicalId, to: child.canonicalId, raw: '/child', status: 'resolved'}], warnings: [], selection};

describe('transactional filesystem export', () => {
  it('writes a portable HTML site, local attachments, manifest, backup, and ZIP', async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), 'ywtc-export-'));
    const output = path.join(temporary, 'site');
    const resources = new Map<string, SourceResource[]>([[root.canonicalId, [{provider: 'yandex-wiki', id: 'a', pageId: '1', name: 'image.png', referenceAliases: ['image.png'], size: 5, mimeType: 'image/png', kind: 'image'}]], [child.canonicalId, []]]);
    const comments = normalizeCommentForest([
      {id: 'c1', author: {providerId: 'u1', displayName: 'Иван'}, createdAt: '2026-01-01', body: 'Смотрите [image](image.png)'},
      {id: 'c2', parentId: 'c1', author: {providerId: 'u2', username: 'anna'}, body: 'Ответ'},
    ], 'yfm');
    resolveCommentAttachmentReferences(comments, resources.get(root.canonicalId)!);
    const commentsByPage = new Map([[root.canonicalId, comments]]);
    const source = {
      listResources: async (page: SourcePage) => resources.get(page.canonicalId) ?? [],
      downloadResource: async (_resource: SourceResource, destination: string) => {
        await writeFile(destination, 'hello');
        return {path: destination, size: 5, sha256: createHash('sha256').update('hello').digest('hex'), mimeType: 'image/png'};
      },
    } as unknown as SourceAdapter;
    const exporter = new FilesystemExporter(source, 2);
    const activity: string[] = [];
    const completed: string[] = [];
    const first = await exporter.export({
      graph, directory: output, format: 'html', identity: 'id', archive: true, dryRun: false,
      cacheDirectory: path.join(temporary, 'cache'), resourcesByPage: resources, commentsByPage,
      onActivity: (message) => activity.push(message), onItem: (message) => completed.push(message),
    });
    expect(first.archive).toMatch(/\.zip$/);
    expect(activity).toEqual(expect.arrayContaining([
      expect.stringContaining('Preparing export page'),
      expect.stringContaining('Downloading image.png'),
      expect.stringContaining('Rendering export page'),
      'Verifying generated export tree',
    ]));
    expect(completed).toEqual(expect.arrayContaining(['attachment image.png', 'page Root', 'page Child']));
    const manifest = JSON.parse(await readFile(path.join(output, '.ywtc-export.json'), 'utf8')) as Record<string, unknown>;
    expect(manifest).toMatchObject({tool: 'ywtc', pages: [{title: 'Root', comments: {status: 'complete', threads: 1, comments: 2, attachments: 1}}, {title: 'Child'}]});
    expect(manifest).not.toHaveProperty('schemaVersion');
    const html = await readFile(path.join(output, 'index.html'), 'utf8');
    expect(html).toContain('pages/child-');
    expect(html).toContain('<section class="ywtc-comments">');
    expect(html).toContain('<details>');
    const second = await exporter.export({graph, directory: output, format: 'html', identity: 'id', archive: false, dryRun: false, cacheDirectory: path.join(temporary, 'cache'), resourcesByPage: resources, commentsByPage});
    expect(second.backup).toContain('.backup-');
    const markdownOutput = path.join(temporary, 'markdown');
    await exporter.export({graph, directory: markdownOutput, format: 'markdown', identity: 'markdown-id', archive: false, dryRun: false, cacheDirectory: path.join(temporary, 'cache'), resourcesByPage: resources, commentsByPage});
    expect(await readFile(path.join(markdownOutput, 'index.md'), 'utf8')).toMatch(/pages\/child-[a-f0-9]+\.md/);
    expect(await readFile(path.join(markdownOutput, 'index.md'), 'utf8')).toContain('attachments/root-');
    expect(await readFile(path.join(markdownOutput, 'index.md'), 'utf8')).toContain('## Комментарии');
  });

  it('does not write a destination during dry-run', async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), 'ywtc-export-dry-'));
    const output = path.join(temporary, 'site');
    const source = {} as SourceAdapter;
    const result = await new FilesystemExporter(source, 1).export({graph, directory: output, format: 'markdown', identity: 'id', archive: false, dryRun: true, cacheDirectory: temporary});
    expect(result.manifest.pages).toHaveLength(2);
    await expect(readFile(path.join(output, '.ywtc-export.json'))).rejects.toThrow();
  });

  it('patches only selected pages in an existing managed export during retry', async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), 'ywtc-export-retry-'));
    const output = path.join(temporary, 'site');
    const resourceFreeRoot = {...root, rawContent: '# Root\n\n[Child](/child)', references: root.references.filter((reference) => reference.kind === 'page')};
    const retryGraph = {...graph, pages: [resourceFreeRoot, child]};
    const resources = new Map<string, SourceResource[]>([[resourceFreeRoot.canonicalId, []], [child.canonicalId, []]]);
    const exporter = new FilesystemExporter({} as SourceAdapter, 1);
    await exporter.export({
      graph: retryGraph, directory: output, format: 'markdown', identity: 'retry-id', archive: false, dryRun: false,
      cacheDirectory: temporary, resourcesByPage: resources,
    });
    const rootBefore = await readFile(path.join(output, 'index.md'), 'utf8');
    const childPath = (JSON.parse(await readFile(path.join(output, '.ywtc-export.json'), 'utf8')) as {pages: Array<{sourceCanonicalId: string; path: string}>})
      .pages.find((page) => page.sourceCanonicalId === child.canonicalId)!.path;
    const updatedChild = {...child, rawContent: 'Retried child body'};
    const loadedPages: string[] = [];
    const result = await exporter.export({
      graph: {...retryGraph, pages: [resourceFreeRoot, updatedChild]},
      directory: output,
      format: 'markdown',
      identity: 'retry-id',
      archive: false,
      dryRun: false,
      cacheDirectory: temporary,
      resourcesByPage: resources,
      retryPageIds: new Set([child.canonicalId]),
      loadPage: async (page) => {
        loadedPages.push(page.canonicalId);
        return page;
      },
    });
    expect(result.mode).toBe('patched');
    expect(loadedPages).toEqual([child.canonicalId]);
    expect(await readFile(path.join(output, 'index.md'), 'utf8')).toBe(rootBefore);
    expect(await readFile(path.join(output, childPath), 'utf8')).toContain('Retried child body');
    expect(result.manifest.pages).toHaveLength(2);
  });

  it('reuses verified files that are outside a targeted resource retry', async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), 'ywtc-export-resource-retry-'));
    const output = path.join(temporary, 'site');
    const resourceFreeRoot = {...root, rawContent: '# Root\n\n[Child](/child)', references: root.references.filter((reference) => reference.kind === 'page')};
    const childWithFiles = {
      ...child,
      rawContent: '[Good](good.pdf) [Bad](bad.pdf)',
      references: [
        {raw: 'good.pdf', href: 'good.pdf', kind: 'attachment' as const},
        {raw: 'bad.pdf', href: 'bad.pdf', kind: 'attachment' as const},
      ],
    };
    const retryGraph = {...graph, pages: [resourceFreeRoot, childWithFiles]};
    const childResources: SourceResource[] = [
      {provider: 'yandex-wiki', id: 'good', pageId: child.id, name: 'good.pdf', kind: 'attachment'},
      {provider: 'yandex-wiki', id: 'bad', pageId: child.id, name: 'bad.pdf', kind: 'attachment'},
    ];
    const resources = new Map<string, SourceResource[]>([[resourceFreeRoot.canonicalId, []], [child.canonicalId, childResources]]);
    const downloads = new Map<string, number>();
    const source = {
      downloadResource: async (item: SourceResource, destination: string) => {
        downloads.set(item.id, (downloads.get(item.id) ?? 0) + 1);
        await writeFile(destination, item.id);
        return {path: destination, size: item.id.length, sha256: createHash('sha256').update(item.id).digest('hex')};
      },
    } as SourceAdapter;
    const exporter = new FilesystemExporter(source, 1);
    await exporter.export({
      graph: retryGraph, directory: output, format: 'markdown', identity: 'resource-retry', archive: false, dryRun: false,
      cacheDirectory: temporary, resourcesByPage: resources,
    });
    const retried = await exporter.export({
      graph: retryGraph, directory: output, format: 'markdown', identity: 'resource-retry', archive: false, dryRun: false,
      cacheDirectory: temporary, resourcesByPage: resources, retryPageIds: new Set([child.canonicalId]),
      retryResourceIds: new Map([[child.canonicalId, new Set(['bad'])]]),
    });

    expect(retried.mode).toBe('patched');
    expect(Object.fromEntries(downloads)).toEqual({good: 1, bad: 2});
    expect(retried.manifest.pages.find((page) => page.sourceCanonicalId === child.canonicalId)?.resources)
      .toEqual(expect.arrayContaining([expect.objectContaining({sourceId: 'good'}), expect.objectContaining({sourceId: 'bad'})]));
  });

  it('allows an existing empty destination directory', async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), 'ywtc-export-empty-'));
    const output = path.join(temporary, 'site');
    await mkdir(output);
    const resourceFreeRoot = {...root, rawContent: '# Root\n\n[Child](/child)', references: root.references.filter((reference) => reference.kind === 'page')};
    const resourceFreeGraph = {...graph, pages: [resourceFreeRoot, child]};
    const resources = new Map<string, SourceResource[]>([[root.canonicalId, []], [child.canonicalId, []]]);
    await expect(new FilesystemExporter({} as SourceAdapter, 1).export({
      graph: resourceFreeGraph, directory: output, format: 'markdown', identity: 'empty-directory', archive: false, dryRun: false,
      cacheDirectory: temporary, resourcesByPage: resources,
    })).resolves.toMatchObject({directory: output});
    await expect(readFile(path.join(output, '.ywtc-export.json'), 'utf8')).resolves.toContain('empty-directory');
  });

  it('refuses a concurrent live export before creating destination files', async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), 'ywtc-export-lock-'));
    const output = path.join(temporary, 'site');
    await writeFile(`${output}.ywtc.lock`, JSON.stringify({
      pid: process.pid,
      hostname: os.hostname(),
      startedAt: new Date().toISOString(),
      purpose: 'ywtc filesystem export',
      target: output,
    }));
    const resourceFreeRoot = {...root, rawContent: '# Root\n\n[Child](/child)', references: root.references.filter((reference) => reference.kind === 'page')};
    const resourceFreeGraph = {...graph, pages: [resourceFreeRoot, child]};
    const resources = new Map<string, SourceResource[]>([[root.canonicalId, []], [child.canonicalId, []]]);
    await expect(new FilesystemExporter({} as SourceAdapter, 1).export({
      graph: resourceFreeGraph, directory: output, format: 'markdown', identity: 'locked', archive: false, dryRun: false,
      cacheDirectory: temporary, resourcesByPage: resources,
    })).rejects.toThrow(/Another ywtc filesystem export is active/);
    await expect(readFile(path.join(output, '.ywtc-export.json'))).rejects.toThrow();
  });

  it('materializes YFM tree directives into selected descendant links', async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), 'ywtc-export-tree-'));
    const treeRoot = {...root, rawContent: '{% tree depth="2" sort="asc" sort_by="title" %}', references: []};
    const treeGraph: PageGraph = {rootId: treeRoot.canonicalId, pages: [treeRoot, child], edges: [], warnings: [], selection};
    const resources = new Map<string, SourceResource[]>([[treeRoot.canonicalId, []], [child.canonicalId, []]]);
    const source = {} as SourceAdapter;
    const exporter = new FilesystemExporter(source, 1);
    const markdown = path.join(temporary, 'markdown');
    await exporter.export({graph: treeGraph, directory: markdown, format: 'markdown', identity: 'tree-md', archive: false, dryRun: false, cacheDirectory: temporary, resourcesByPage: resources});
    expect(await readFile(path.join(markdown, 'index.md'), 'utf8')).toMatch(/- \[Child\]\(pages\/child-[a-f0-9]+\.md\)/);
    const html = path.join(temporary, 'html');
    await exporter.export({graph: treeGraph, directory: html, format: 'html', identity: 'tree-html', archive: false, dryRun: false, cacheDirectory: temporary, resourcesByPage: resources});
    expect(await readFile(path.join(html, 'index.html'), 'utf8')).toContain('aria-label="Child pages"');
  });

  it('keeps responsive HTML columns, records Markdown linearization, and leaves empty pages fallback-free', async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), 'ywtc-export-layout-'));
    const layoutRoot = {
      ...root,
      rawContent: '{% layout gap=l %}\n{% block %}\nLeft\n{% endblock %}\n{% block %}\nRight\n{% endblock %}\n{% endlayout %}',
      references: [],
    };
    const layoutGraph: PageGraph = {
      rootId: layoutRoot.canonicalId, pages: [layoutRoot], edges: [], warnings: [],
      selection: {...selection, returnedDescendants: 0, selectedDescendants: 0, maximumDepth: 0},
    };
    const resources = new Map<string, SourceResource[]>([[layoutRoot.canonicalId, []]]);
    const exporter = new FilesystemExporter({} as SourceAdapter, 1);
    const htmlOutput = path.join(temporary, 'html');
    const htmlResult = await exporter.export({graph: layoutGraph, directory: htmlOutput, format: 'html', identity: 'layout-html', archive: false, dryRun: false, cacheDirectory: temporary, resourcesByPage: resources});
    expect(htmlResult.manifest.pages[0]).toMatchObject({degraded: false});
    expect(await readFile(path.join(htmlOutput, 'index.html'), 'utf8')).toContain('ywtc-layout-columns-2');
    expect(await readFile(path.join(htmlOutput, 'assets/site.css'), 'utf8')).toContain('grid-template-columns');

    const markdownOutput = path.join(temporary, 'markdown');
    const markdownResult = await exporter.export({graph: layoutGraph, directory: markdownOutput, format: 'markdown', identity: 'layout-markdown', archive: false, dryRun: false, cacheDirectory: temporary, resourcesByPage: resources});
    expect(markdownResult.manifest.pages[0]).toMatchObject({degraded: false, warnings: [], adaptations: [expect.stringContaining('linearized')]});
    expect(await readFile(path.join(markdownOutput, 'index.md'), 'utf8')).toContain('### Column 2');
    await expect(readdir(path.join(markdownOutput, '_source'))).rejects.toMatchObject({code: 'ENOENT'});

    const emptyRoot = {...root, rawContent: '### ', references: []};
    const emptyGraph: PageGraph = {...layoutGraph, rootId: emptyRoot.canonicalId, pages: [emptyRoot]};
    const emptyOutput = path.join(temporary, 'empty');
    const emptyResult = await exporter.export({graph: emptyGraph, directory: emptyOutput, format: 'html', identity: 'empty-html', archive: false, dryRun: false, cacheDirectory: temporary, resourcesByPage: new Map([[emptyRoot.canonicalId, []]])});
    expect(emptyResult.manifest.pages[0]).toMatchObject({degraded: false});
    expect(await readFile(path.join(emptyOutput, 'index.html'), 'utf8')).not.toContain('Source content fallback');
  });

  it('preserves an export with an unknown manifest field instead of adopting it', async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), 'ywtc-export-invalid-'));
    const output = path.join(temporary, 'site');
    const resources = new Map<string, SourceResource[]>([[root.canonicalId, [{provider: 'yandex-wiki', id: 'a', pageId: '1', name: 'image.png', size: 5, mimeType: 'image/png', kind: 'image'}]], [child.canonicalId, []]]);
    const source = {
      downloadResource: async (_resource: SourceResource, destination: string) => {
        await writeFile(destination, 'hello');
        return {path: destination, size: 5, sha256: 'hash', mimeType: 'image/png'};
      },
    } as unknown as SourceAdapter;
    const exporter = new FilesystemExporter(source, 1);
    await exporter.export({graph, directory: output, format: 'markdown', identity: 'id', archive: false, dryRun: false, cacheDirectory: temporary, resourcesByPage: resources});
    const manifestPath = path.join(output, '.ywtc-export.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown>;
    await writeFile(manifestPath, `${JSON.stringify({...manifest, schemaVersion: 2})}\n`);
    await expect(exporter.export({graph, directory: output, format: 'markdown', identity: 'id', archive: false, dryRun: false, cacheDirectory: temporary, resourcesByPage: resources})).rejects.toThrow(/unmanaged destination/);
    await expect(stat(output)).resolves.toMatchObject({});
    await expect(readFile(manifestPath, 'utf8')).resolves.toContain('schemaVersion');
  });
});

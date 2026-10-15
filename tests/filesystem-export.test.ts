import {mkdtemp, readFile, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
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
const graph: PageGraph = {rootId: root.canonicalId, pages: [root, child], edges: [{from: root.canonicalId, to: child.canonicalId, raw: '/child', status: 'resolved'}], warnings: []};

describe('transactional filesystem export', () => {
  it('writes a portable HTML site, local attachments, manifest, backup, and ZIP', async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), 'ywtc-export-'));
    const output = path.join(temporary, 'site');
    const resources = new Map<string, SourceResource[]>([[root.canonicalId, [{provider: 'yandex-wiki', id: 'a', pageId: '1', name: 'image.png', size: 5, mimeType: 'image/png', kind: 'image'}]], [child.canonicalId, []]]);
    const source = {
      listResources: async (page: SourcePage) => resources.get(page.canonicalId) ?? [],
      downloadResource: async (_resource: SourceResource, destination: string) => {
        await writeFile(destination, 'hello');
        return {path: destination, size: 5, sha256: 'hash', mimeType: 'image/png'};
      },
    } as unknown as SourceAdapter;
    const exporter = new FilesystemExporter(source, 2);
    const first = await exporter.export({graph, directory: output, format: 'html', identity: 'id', archive: true, dryRun: false, cacheDirectory: path.join(temporary, 'cache'), resourcesByPage: resources});
    expect(first.archive).toMatch(/\.zip$/);
    expect(JSON.parse(await readFile(path.join(output, '.ywtc-export.json'), 'utf8'))).toMatchObject({schemaVersion: 2, pages: [{title: 'Root'}, {title: 'Child'}]});
    expect(await readFile(path.join(output, 'index.html'), 'utf8')).toContain('pages/child-');
    const second = await exporter.export({graph, directory: output, format: 'html', identity: 'id', archive: false, dryRun: false, cacheDirectory: path.join(temporary, 'cache'), resourcesByPage: resources});
    expect(second.backup).toContain('.backup-');
    const markdownOutput = path.join(temporary, 'markdown');
    await exporter.export({graph, directory: markdownOutput, format: 'markdown', identity: 'markdown-id', archive: false, dryRun: false, cacheDirectory: path.join(temporary, 'cache'), resourcesByPage: resources});
    expect(await readFile(path.join(markdownOutput, 'index.md'), 'utf8')).toMatch(/pages\/child-[a-f0-9]+\.md/);
    expect(await readFile(path.join(markdownOutput, 'index.md'), 'utf8')).toContain('attachments/root-');
  });

  it('does not write a destination during dry-run', async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), 'ywtc-export-dry-'));
    const output = path.join(temporary, 'site');
    const source = {} as SourceAdapter;
    const result = await new FilesystemExporter(source, 1).export({graph, directory: output, format: 'markdown', identity: 'id', archive: false, dryRun: true, cacheDirectory: temporary});
    expect(result.manifest.pages).toHaveLength(2);
    await expect(readFile(path.join(output, '.ywtc-export.json'))).rejects.toThrow();
  });
});

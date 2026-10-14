import {mkdtemp, readFile, stat} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {emptyConversionStats} from '../src/conversion.js';
import {MigrationReport, renderStoragePreview} from '../src/report.js';

describe('migration report', () => {
  it('writes an ignored-style per-run HTML and compact JSON bundle with hierarchy and comparisons', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'ywtc-report-'));
    const report = new MigrationReport({
      dryRun: true,
      sourceRoot: 'docs',
      sourceRootUrl: 'https://wiki.example.test/docs',
      targetPageId: '100',
      targetUrl: 'https://confluence.example.test/pages/viewpage.action?pageId=100',
      spaceKey: 'DOC',
      state: {
        id: '1234567890abcdef12345678',
        mode: 'automatic',
        path: '.states/1234567890abcdef12345678.json',
        source: 'new',
      },
    });
    report.setSummary({
      pages: 2,
      descendants: 1,
      pagesToCreate: 2,
      pagesToUpdate: 0,
      attachments: 1,
      attachmentBytes: 2048,
      dynamicTables: 1,
      dynamicTableRows: 3,
      renamedPages: 0,
      warnings: 1,
      links: {internal: 1, external: 1, attachments: 1, anchors: 1},
      images: {attached: 1, external: 0},
      staticTables: 1,
      codeBlocks: 1,
    });
    report.addPage({
      sourceId: 1,
      sourceSlug: 'docs',
      sourceTitle: 'Docs',
      sourceUrl: 'https://wiki.example.test/docs',
      depth: 0,
      destinationTitle: 'Docs',
      status: 'planned',
      attachments: 0,
      attachmentBytes: 0,
      attachmentItems: [],
      grids: 0,
      gridRows: 0,
      sourceCharacters: 12,
      destinationCharacters: 18,
      metrics: emptyConversionStats(),
      destinationPreviewProvenance: 'storage-fallback',
      warnings: [],
    }, {
      source: {
        html: '<h1>TOP SECRET PREVIEW</h1><script>alert(1)</script>',
        baseUrl: 'https://wiki.example.test/docs',
        provenance: 'yandex-rendered',
      },
      destination: {
        html: '<h1>Converted</h1>',
        baseUrl: 'https://confluence.example.test/',
        provenance: 'storage-fallback',
      },
    });
    report.addPage({
      sourceId: 2,
      sourceSlug: 'docs/child',
      sourceTitle: 'Child',
      sourceUrl: 'https://wiki.example.test/docs/child',
      parentSourceId: 1,
      depth: 1,
      destinationTitle: 'Child',
      status: 'failed',
      attachments: 1,
      attachmentBytes: 2048,
      attachmentItems: [{
        sourceId: 10,
        sourceName: 'diagram.png',
        destinationName: 'diagram.png',
        size: 2048,
        status: 'failed',
        error: 'Download failed',
      }],
      grids: 1,
      gridRows: 3,
      sourceCharacters: 5,
      destinationCharacters: 9,
      metrics: {...emptyConversionStats(), internalPageLinks: 1, tables: 2},
      destinationPreviewProvenance: 'storage-fallback',
      warnings: ['A widget was flattened'],
      error: 'Download failed',
    });
    report.addError('docs/child: Download failed');

    const paths = await report.write(path.join(directory, 'state.json'));
    await expect(stat(paths.directory)).resolves.toBeDefined();
    await expect(stat(paths.html)).resolves.toBeDefined();
    await expect(stat(paths.json)).resolves.toBeDefined();
    expect(path.basename(paths.html)).toBe('index.html');
    expect(path.basename(paths.json)).toBe('report.json');
    expect(path.dirname(paths.html)).toBe(paths.directory);

    const [html, jsonText] = await Promise.all([
      readFile(paths.html, 'utf8'),
      readFile(paths.json, 'utf8'),
    ]);
    const metadata = JSON.parse(jsonText) as {version: number; pages: Array<{parentSourceId?: number; attachmentItems: unknown[]}>};
    expect(metadata.version).toBe(3);
    expect(metadata.pages[1]).toMatchObject({parentSourceId: 1});
    expect(metadata.pages[1]?.attachmentItems).toHaveLength(1);
    expect(jsonText).not.toContain('TOP SECRET PREVIEW');
    expect(html).toContain('Page hierarchy');
    expect(html).toContain('page-1');
    expect(html).toContain('page-2');
    expect(html).toContain('Page comparison');
    expect(html).toContain('state 1234567890abcdef12345678');
    expect(html).toContain('Download JSON');
    expect(html).toContain('href="report.json" download');
    expect(html).toContain('sandbox loading="lazy"');
    expect(html).toContain('TOP SECRET PREVIEW');
    expect(html).not.toContain('alert(1)');
    expect(html).not.toContain('<script src=');
  });

  it('renders common Confluence storage constructs as readable preview HTML', () => {
    const preview = renderStoragePreview(
      '<ac:structured-macro ac:name="info"><ac:parameter ac:name="title">Heads up</ac:parameter><ac:rich-text-body><p>Body</p></ac:rich-text-body></ac:structured-macro>'
      + '<ac:task-list><ac:task><ac:task-status>complete</ac:task-status><ac:task-body>Done</ac:task-body></ac:task></ac:task-list>'
      + '<ac:image><ri:attachment ri:filename="diagram.png"/></ac:image>',
    );

    expect(preview).toContain('Heads up');
    expect(preview).toContain('Body');
    expect(preview).toContain('☑');
    expect(preview).toContain('diagram.png');
    expect(preview).not.toContain('ac:structured-macro');
  });
});

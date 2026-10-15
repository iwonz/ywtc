import {describe, expect, it} from 'vitest';
import {
  appendGridSnapshots,
  assertDestinationContent,
  extractPageReferences,
  legacyTransferPlaceholder,
  normalizePageContent,
  rawContentFallback,
  renderConfluenceStorage,
  renderMarkdown,
  renderStaticHtml,
  renderYfm,
  setSourceResourceBinding,
  sourceResourceBindings,
  stripAnsi,
  verifyDestinationContent,
} from '../src/content-model.js';
import type {DestinationPage, RenderContext, SourcePage, SourceResource} from '../src/domain.js';

const source = (rawContent: string, rawFormat: SourcePage['rawFormat'] = 'yfm'): SourcePage => ({
  provider: rawFormat === 'yfm' ? 'yandex-wiki' : 'confluence', profile: 'source', id: '1', canonicalId: 'source:1',
  title: 'Root', locator: 'root', url: 'https://wiki.example.com/root', rawContent, rawFormat,
  references: extractPageReferences(rawContent, rawFormat),
});
const destination: DestinationPage = {
  provider: 'confluence', profile: 'dest', id: '2', canonicalId: 'dest:2', title: 'Child', url: 'https://conf.example/pages/2', locator: '2',
};

describe('normalized content pipeline', () => {
  it('discovers Markdown, bare, Confluence page, attachment, and anchor references', () => {
    expect(extractPageReferences('[Child](/child) https://wiki.example.com/other', 'yfm').filter((item) => item.kind === 'page')).toHaveLength(2);
    const storage = '<ac:link ac:anchor="part"><ri:page ri:content-id="2" ri:content-title="Child"/></ac:link><ri:attachment ri:filename="a.pdf"/>';
    const refs = extractPageReferences(storage, 'confluence-storage');
    expect(refs.map((item) => item.kind)).toEqual(['page', 'attachment']);
  });

  it('renders portable Markdown/HTML and sanitizes active content', async () => {
    const page = source('# Hello\n\n[Child](/child)\n\n<script>alert(1)</script>');
    const child = {...source(''), id: '2', canonicalId: 'source:2', title: 'Child', locator: 'child', url: 'https://wiki.example.com/child'};
    const context: RenderContext = {
      pages: new Map([['source:2', {path: 'pages/child.md', title: 'Child'}]]), resources: new Map(),
      sourcePages: new Map([[page.canonicalId, page], [child.canonicalId, child]]), currentPageId: page.canonicalId, currentPath: 'index.md',
    };
    const document = normalizePageContent(page);
    await expect(renderMarkdown(document, context)).resolves.toMatchObject({body: expect.stringContaining('pages/child.md')});
    const html = await renderStaticHtml(document, context);
    expect(html.body).not.toContain('<script');
  });

  it('converts between Storage and YFM and rewrites selected page references', async () => {
    const page = source('<p>See <ac:link><ri:page ri:content-id="2" ri:content-title="Child"/><ac:link-body>Child</ac:link-body></ac:link></p>', 'confluence-storage');
    const child = {...page, id: '2', canonicalId: 'source:2', title: 'Child'};
    const context: RenderContext = {
      pages: new Map([['source:2', destination]]), resources: new Map(),
      sourcePages: new Map([[page.canonicalId, page], [child.canonicalId, child]]), currentPageId: page.canonicalId,
    };
    const document = normalizePageContent(page);
    expect((await renderYfm(document, context)).body).toContain('https://conf.example/pages/2');
    expect((await renderConfluenceStorage(document, page, context, 'DOC')).body).toContain('ri:content-title="Child"');
  });

  it('rewrites YFM link targets without replacing matching prose', async () => {
    const page = source('[Child](/child) child');
    const child = {...source(''), id: '2', canonicalId: 'source:2', title: 'Child', locator: 'child', url: 'https://wiki.example.com/child'};
    const wikiDestination: DestinationPage = {
      provider: 'yandex-wiki', profile: 'dest', id: '20', canonicalId: 'dest:20', title: 'Child',
      url: 'https://wiki.destination/archive/child', locator: 'archive/child',
    };
    const context: RenderContext = {
      pages: new Map([[child.canonicalId, wikiDestination]]), resources: new Map(),
      sourcePages: new Map([[page.canonicalId, page], [child.canonicalId, child]]), currentPageId: page.canonicalId,
    };
    expect((await renderYfm(normalizePageContent(page), context)).body).toBe('[Child](archive/child) child');
  });

  it('preserves static Grid data in remote YFM and Confluence renderers', async () => {
    const page = source('# Root');
    const grid: SourceResource = {
      provider: 'yandex-wiki', id: 'grid-1', pageId: page.id, name: 'Roadmap.grid.json', kind: 'grid',
      metadata: {grid: {title: 'Roadmap', structure: {columns: [{title: 'Task'}, {title: 'Done'}]}, rows: [{row: ['Ship', true]}]}},
    };
    const document = appendGridSnapshots(normalizePageContent(page), [grid]);
    const context: RenderContext = {
      pages: new Map(), resources: new Map(), sourcePages: new Map([[page.canonicalId, page]]), currentPageId: page.canonicalId,
    };
    expect((await renderYfm(document, context)).body).toMatch(/\| Ship \| ✓\s+\|/);
    expect((await renderConfluenceStorage(document, page, context, 'DOC')).body).toContain('<table>');
  });

  it('keeps unavailable resources as explicit source fallbacks and uses native uploaded attachments', async () => {
    const page = source('![Diagram](diagram.png)\n\n[Download](manual.pdf)');
    const resources: SourceResource[] = [
      {provider: 'yandex-wiki', id: 'image', pageId: page.id, name: 'diagram.png', kind: 'image', downloadUrl: '/download/diagram.png'},
      {provider: 'yandex-wiki', id: 'file', pageId: page.id, name: 'manual.pdf', kind: 'attachment', downloadUrl: '/download/manual.pdf'},
    ];
    const fallbackContext: RenderContext = {
      pages: new Map(), resources: sourceResourceBindings(page, resources),
      sourcePages: new Map([[page.canonicalId, page]]), currentPageId: page.canonicalId,
    };
    const yfm = await renderYfm(normalizePageContent(page), fallbackContext);
    expect(yfm.body).toContain('https://wiki.example.com/download/diagram.png');
    expect(yfm.body).toContain('https://wiki.example.com/download/manual.pdf');
    expect(yfm.degraded).toBe(true);
    const storage = await renderConfluenceStorage(normalizePageContent(page), page, fallbackContext, 'DOC');
    expect(storage.body).toContain('<ri:url');
    expect(storage.body).toContain('https://wiki.example.com/download/manual.pdf');

    const uploadedContext: RenderContext = {
      ...fallbackContext,
      resources: new Map(resources.map((resource) => [resource.name.toLocaleLowerCase(), {
        kind: 'uploaded' as const,
        resource: {id: `dest-${resource.id}`, name: resource.name},
      }])),
    };
    const uploadedStorage = await renderConfluenceStorage(normalizePageContent(page), page, uploadedContext, 'DOC');
    expect(uploadedStorage.body).toContain('<ri:attachment ri:filename="diagram.png"');
    expect(uploadedStorage.body).toContain('<ri:attachment ri:filename="manual.pdf"');
  });

  it('resolves duplicate API names through exact download aliases and rewrites each resource independently', async () => {
    const page = source('![First](/root/.files/image.png)\n\n![Second](/root/.files/image-1.png)');
    const resources: SourceResource[] = [
      {
        provider: 'yandex-wiki', id: 'one', pageId: page.id, name: 'image.png', preferredName: 'image.png',
        downloadUrl: '/root/.files/image.png', referenceAliases: ['/root/.files/image.png'], kind: 'image',
      },
      {
        provider: 'yandex-wiki', id: 'two', pageId: page.id, name: 'image.png', preferredName: 'image-1.png',
        downloadUrl: '/root/.files/image-1.png', referenceAliases: ['/root/.files/image-1.png'], kind: 'image',
      },
    ];
    const bindings = sourceResourceBindings(page, resources);
    setSourceResourceBinding(bindings, page, resources, resources[0]!, {kind: 'uploaded', resource: {id: 'd1', name: 'image.png'}});
    setSourceResourceBinding(bindings, page, resources, resources[1]!, {kind: 'uploaded', resource: {id: 'd2', name: 'image-1.png'}});
    const context: RenderContext = {
      pages: new Map(),
      resources: bindings, sourcePages: new Map([[page.canonicalId, page]]), currentPageId: page.canonicalId,
    };
    const rendered = await renderConfluenceStorage(normalizePageContent(page), page, context, 'DOC');
    expect(rendered.body).toContain('ri:filename="image.png"');
    expect(rendered.body).toContain('ri:filename="image-1.png"');
  });

  it('records empty headings as safe normalization and verifies provider-safe serialization changes', async () => {
    const page = source('#\n\n## Named\n\nBody');
    const document = normalizePageContent(page);
    expect(document.normalizations).toEqual([expect.stringContaining('empty heading')]);
    expect(document.warnings.join(' ')).not.toMatch(/Header without title/i);
    expect(stripAnsi('\u001B[33mHeader without title\u001B[0m')).toBe('Header without title');
    expect(verifyDestinationContent('<h1></h1><h2>Named</h2><p>Body</p>', '<h2 data-provider="true">Named</h2><p>Body</p>', 'confluence', page))
      .toEqual({status: 'complete', differences: []});
    expect(verifyDestinationContent('<h2>Named</h2><p>Body</p>', '<p>Named</p><p>Body</p>', 'confluence', page).status).toBe('partial');
    expect(verifyDestinationContent('<table><tr><td>A</td></tr></table>', '<table><tr><td></td></tr></table>', 'confluence', page).status).toBe('failed');
    expect(verifyDestinationContent('<pre><code>x</code></pre>', '<p>x</p>', 'confluence', page).status).toBe('failed');
    expect(verifyDestinationContent('<a href="https://example.com">Link</a>', '<p>Link</p>', 'confluence', page).status).toBe('failed');
  });

  it('renders supported YFM tree directives natively and as static navigation', async () => {
    const page = {...source('{% tree depth="2" sort="asc" sort_by="title" %}'), depth: 0};
    const child = {...source('Child body'), id: '2', canonicalId: 'source:2', title: 'Child', projectedParentId: page.canonicalId, depth: 1};
    const context: RenderContext = {
      pages: new Map([[child.canonicalId, {path: 'pages/child.md', title: child.title}]]),
      resources: new Map(), sourcePages: new Map([[page.canonicalId, page], [child.canonicalId, child]]),
      currentPageId: page.canonicalId, currentPath: 'index.md',
    };
    const document = normalizePageContent(page);
    const storage = await renderConfluenceStorage(document, page, context, 'DOC');
    expect(storage.body).toContain('ac:name="children"');
    expect(storage.body).toContain('ac:name="depth">2');
    expect(storage.degraded).toBe(false);
    await expect(renderMarkdown(document, context)).resolves.toMatchObject({body: expect.stringContaining('[Child](pages/child.md)')});
    await expect(renderStaticHtml(document, context)).resolves.toMatchObject({body: expect.stringContaining('aria-label="Child pages"')});
    await expect(renderYfm(document, context)).resolves.toMatchObject({body: expect.stringContaining('{% tree depth="2"')});
  });

  it('keeps Confluence storage void elements XML-safe after heading normalization', async () => {
    const page = source('#\n\nLine one\\\nLine two\n\n---');
    const context: RenderContext = {
      pages: new Map(), resources: new Map(), sourcePages: new Map([[page.canonicalId, page]]), currentPageId: page.canonicalId,
    };
    const storage = await renderConfluenceStorage(normalizePageContent(page), page, context, 'DOC');
    expect(storage.body).not.toMatch(/<(?:br|hr)>/);
    expect(storage.body).toMatch(/<(?:br|hr)\s*\/>/);
  });

  it('provides complete raw fallback and rejects empty, truncated, or legacy placeholder bodies', () => {
    const page = source('# Full source\n\nImportant details');
    const fallback = rawContentFallback(page, 'confluence', 'test renderer failure');
    expect(fallback.body).toContain('Full source');
    expect(fallback.body).toContain('Important details');
    expect(() => assertDestinationContent(fallback.body, fallback.body, 'confluence', page)).not.toThrow();
    expect(() => assertDestinationContent(fallback.body, '', 'confluence', page)).toThrow(/empty destination content/);
    expect(() => assertDestinationContent(fallback.body, '<p>Full source</p>', 'confluence', page)).toThrow(/differs/);
    expect(() => assertDestinationContent(
      fallback.body,
      legacyTransferPlaceholder('confluence', page),
      'confluence',
      page,
    )).toThrow(/transfer placeholder/);
  });
});

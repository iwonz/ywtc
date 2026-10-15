import {describe, expect, it} from 'vitest';
import {
  appendGridSnapshots,
  extractPageReferences,
  normalizePageContent,
  renderConfluenceStorage,
  renderMarkdown,
  renderStaticHtml,
  renderYfm,
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
});

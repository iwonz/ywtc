import {describe, expect, it} from 'vitest';
import {
  appendGridSnapshots,
  assertDestinationContent,
  DestinationContentVerificationError,
  emptyRendererFallbackReason,
  extractPageReferences,
  legacyTransferPlaceholder,
  normalizePageContent,
  normalizedPreviewHtml,
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
  it('isolates Diplodoc diagnostics between source pages', () => {
    const unresolved = normalizePageContent(source('Hello {{ missing_value }}'));
    expect(unresolved.warnings.join(' ')).toMatch(/missing_value|variable/i);

    const clean = normalizePageContent(source('# Clean page\n\nContent'));
    expect(clean.warnings).toEqual([]);
    expect(clean.degraded).toBe(false);
  });

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

  it('preserves same-vendor macros without turning parser fallbacks into false degradation', async () => {
    const page = source('<ac:structured-macro ac:name="vendor-widget"><ac:rich-text-body><p>Payload</p></ac:rich-text-body></ac:structured-macro>', 'confluence-storage');
    const document = normalizePageContent(page);
    const context: RenderContext = {
      pages: new Map(), resources: new Map(),
      sourcePages: new Map([[page.canonicalId, page]]), currentPageId: page.canonicalId,
    };
    expect(document.warnings).toContainEqual(expect.stringContaining('vendor-widget'));
    const rendered = await renderConfluenceStorage(document, page, context, 'DOC');
    expect(rendered.body).toContain('ac:name="vendor-widget"');
    expect(rendered.body).toContain('Payload');
    expect(rendered.degraded).toBe(false);
    expect(rendered.notices).not.toContainEqual(expect.objectContaining({kind: 'degradation'}));
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

  it('recovers provider-null Grid pages from Grid data without degrading them', async () => {
    const page: SourcePage = {
      ...source(''),
      contentAvailability: {status: 'provider-unavailable', sourceType: 'grid', reason: 'provider-null-body'},
    };
    const grid: SourceResource = {
      provider: 'yandex-wiki', id: 'grid-1', pageId: page.id, name: 'Results.grid.json', kind: 'grid',
      metadata: {grid: {title: 'Results', structure: {columns: [{title: 'Name'}]}, rows: [{row: ['Value']}]}},
    };
    const document = appendGridSnapshots(normalizePageContent(page), [grid]);
    expect(document.degraded).toBe(false);
    expect(document.semanticallyEmpty).toBe(false);
    expect(document.warnings).toEqual([]);
    expect(document.adaptations).toContainEqual(expect.stringContaining('Dynamic table'));
  });

  it('keeps a provider-null Grid page visible and partial when no Grid payload is exposed', async () => {
    const page: SourcePage = {
      ...source(''),
      contentAvailability: {status: 'provider-unavailable', sourceType: 'grid', reason: 'provider-null-body'},
    };
    const document = appendGridSnapshots(normalizePageContent(page), []);
    const context: RenderContext = {
      pages: new Map(), resources: new Map(), sourcePages: new Map([[page.canonicalId, page]]), currentPageId: page.canonicalId,
    };
    expect(document.degraded).toBe(true);
    expect(document.semanticallyEmpty).toBe(false);
    expect(document.warnings).toContainEqual(expect.stringContaining('unavailable through the provider API'));
    expect((await renderYfm(document, context)).body).toContain(page.url);
    expect((await renderConfluenceStorage(document, page, context, 'DOC')).body).toContain(page.url);

    const emptyPage = appendGridSnapshots(normalizePageContent(source('')), []);
    expect(emptyPage.semanticallyEmpty).toBe(true);
    expect(emptyPage.degraded).toBe(false);
  });

  it('keeps ordinary content and a source-linked fallback when one enumerated Grid payload is unavailable', async () => {
    const page = source('# Root\n\nImportant text');
    const grid: SourceResource = {
      provider: 'yandex-wiki', id: 'grid-1', pageId: page.id, name: 'Metrics.grid.json', kind: 'grid', sourceUrl: page.url,
      metadata: {summary: {id: 'grid-1', title: 'Metrics'}},
      inventoryFailure: {
        operation: 'grid-read', code: 'network-inventory-grid-read', retryable: true,
        status: 504, attempts: 5, endpoint: '/grids/grid-1', message: 'Service unavailable',
      },
    };
    const document = appendGridSnapshots(normalizePageContent(page), [grid]);
    const context: RenderContext = {
      pages: new Map(), resources: new Map(), sourcePages: new Map([[page.canonicalId, page]]), currentPageId: page.canonicalId,
    };
    const storage = await renderConfluenceStorage(document, page, context, 'DOC');
    expect(storage.body).toContain('Important text');
    expect(storage.body).toContain('Metrics.grid.json');
    expect(storage.body).toContain(page.url);
    expect(document).toMatchObject({degraded: true, semanticallyEmpty: false, metrics: {tables: 0}});
    expect(document.metrics.links).toBeGreaterThanOrEqual(1);
    expect(document.adaptations).toEqual([]);
    expect(document.warnings).toContainEqual(expect.stringContaining('could not be read'));
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

  it('preserves external images as complete references without downloading them', async () => {
    const page = source('![Architecture](https://cdn.example.com/diagram.png){width=640 height=360}');
    const context: RenderContext = {
      pages: new Map(), resources: new Map(),
      sourcePages: new Map([[page.canonicalId, page]]), currentPageId: page.canonicalId,
    };
    const rendered = await renderConfluenceStorage(normalizePageContent(page), page, context, 'DOC');
    expect(rendered.body).toContain('https://cdn.example.com/diagram.png');
    expect(rendered.body).toContain('ac:alt="Architecture"');
    expect(rendered.body).toContain('ac:width="640"');
    expect(rendered.degraded).toBe(false);
    expect(rendered.warnings).toEqual([]);
    expect(rendered.preservedExternalReferences).toBe(1);
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
      .toEqual({status: 'complete', differences: [], adaptations: []});
    expect(verifyDestinationContent('<h2>Named</h2><p>Body</p>', '<p>Named</p><p>Body</p>', 'confluence', page).status).toBe('partial');
    expect(verifyDestinationContent('<table><tr><td>A</td></tr></table>', '<table><tr><td></td></tr></table>', 'confluence', page).status).toBe('failed');
    expect(verifyDestinationContent('<pre><code>x</code></pre>', '<p>x</p>', 'confluence', page).status).toBe('failed');
    expect(verifyDestinationContent('<a href="https://example.com">Link</a>', '<p>Link</p>', 'confluence', page).status).toBe('failed');
    expect(verifyDestinationContent(
      '<ac:image ac:alt="Source label"><ri:url ri:value="https://example.com/image.png"/></ac:image>',
      '<ac:image><ri:url ri:value="https://example.com/image.png"/></ac:image>',
      'confluence',
      page,
    ).status).toBe('partial');
    expect(verifyDestinationContent(
      '<ac:image><ri:url ri:value="https://example.com/image.png"/></ac:image>',
      '<ac:image><ri:url ri:value="https://example.com/other.png"/></ac:image>',
      'confluence',
      page,
    ).status).toBe('failed');
  });

  it('accepts empty scaffolding, legacy color tokens, and regenerated service anchors without hiding data loss', () => {
    const page = source('Body');
    const expected = [
      '<h2 id="generated-one">Section</h2>',
      '<p><a href="#generated-one">Section</a></p>',
      '<ul><li>{red}&#x20;MAU</li><li></li></ul>',
      '<table><tbody><tr><td>Value</td></tr><tr><td></td></tr></tbody></table>',
    ].join('');
    const normalized = [
      '<h2 id="provider-anchor">Section</h2>',
      '<p><a href="#provider-anchor">Section</a></p>',
      '<ul><li>MAU</li></ul>',
      '<table><tbody><tr><td>Value</td></tr></tbody></table>',
    ].join('');
    expect(verifyDestinationContent(expected, normalized, 'confluence', page).status).toBe('complete');
    expect(verifyDestinationContent(expected, normalized.replace('Value', ''), 'confluence', page).status).toBe('failed');
  });

  it('preserves meaningful attachment image alt text as a verified caption', async () => {
    const page = source('![Architecture diagram](image.png)');
    const image: SourceResource = {
      provider: 'yandex-wiki', id: 'image', pageId: page.id, name: 'image.png', preferredName: 'image.png', kind: 'image',
    };
    const bindings = sourceResourceBindings(page, [image]);
    setSourceResourceBinding(bindings, page, [image], image, {kind: 'uploaded', resource: {id: 'uploaded', name: 'image.png'}});
    const context: RenderContext = {
      pages: new Map(), resources: bindings, sourcePages: new Map([[page.canonicalId, page]]), currentPageId: page.canonicalId,
    };
    const rendered = await renderConfluenceStorage(normalizePageContent(page), page, context, 'DOC');
    expect(rendered.body).toContain('Image description: Architecture diagram');
    expect(rendered.adaptations).toContainEqual(expect.stringContaining('alternative text'));
    const providerNormalized = rendered.body.replace(' ac:alt="Architecture diagram"', '');
    expect(verifyDestinationContent(rendered.body, providerNormalized, 'confluence', page).status).toBe('complete');

    const redundant = source('![image.png](image.png)');
    const redundantBindings = sourceResourceBindings(redundant, [image]);
    setSourceResourceBinding(redundantBindings, redundant, [image], image, {kind: 'uploaded', resource: {id: 'uploaded', name: 'image.png'}});
    const redundantRendered = await renderConfluenceStorage(normalizePageContent(redundant), redundant, {
      pages: new Map(), resources: redundantBindings, sourcePages: new Map([[redundant.canonicalId, redundant]]), currentPageId: redundant.canonicalId,
    }, 'DOC');
    expect(redundantRendered.body).not.toContain('Image description:');
  });

  it('treats empty editor scaffolding as a complete empty page without fallback', async () => {
    const page = source('### ');
    const document = normalizePageContent(page);
    const context: RenderContext = {
      pages: new Map(), resources: new Map(), sourcePages: new Map([[page.canonicalId, page]]), currentPageId: page.canonicalId,
    };
    expect(document.semanticallyEmpty).toBe(true);
    expect(document.degraded).toBe(false);
    expect(document.normalizations).toEqual([expect.stringContaining('empty heading')]);
    await expect(renderConfluenceStorage(document, page, context, 'DOC')).resolves.toMatchObject({body: '<p></p>', degraded: false});
    await expect(renderYfm(document, context)).resolves.toMatchObject({body: '', degraded: false});
    await expect(renderMarkdown(document, context)).resolves.toMatchObject({body: '', degraded: false});
    expect(verifyDestinationContent('<p></p>', '', 'confluence', page)).toEqual({status: 'complete', differences: [], adaptations: []});
    expect(verifyDestinationContent('<p></p>', '<p>Unexpected</p>', 'confluence', page).status).toBe('failed');
  });

  it('preserves YFM columns as typed layouts, native Confluence storage, and responsive HTML', async () => {
    const page = source([
      'Intro',
      '',
      '{% layout gap=l %}',
      '{% block %}',
      '**Left**',
      '{% endblock %}',
      '{% block %}',
      'Middle',
      '{% endblock %}',
      '{% block %}',
      'Right',
      '{% endblock %}',
      '{% endlayout %}',
      '',
      'Outro',
    ].join('\n'));
    const document = normalizePageContent(page);
    const context: RenderContext = {
      pages: new Map(), resources: new Map(), sourcePages: new Map([[page.canonicalId, page]]), currentPageId: page.canonicalId,
    };
    expect(document.semanticallyEmpty).toBe(false);
    expect(document.root.children?.map((node) => node.type)).toContain('layout');
    expect(normalizedPreviewHtml(document)).toContain('ywtc-layout-columns-3');
    const storage = await renderConfluenceStorage(document, page, context, 'DOC');
    expect(storage.body).toContain('<ac:layout>');
    expect(storage.body).toContain('<ac:layout-section ac:type="three_equal">');
    expect(storage.body.match(/<ac:layout-cell>/g)).toHaveLength(5);
    expect(storage.body.indexOf('Left')).toBeLessThan(storage.body.indexOf('Middle'));
    expect(storage.body.indexOf('Middle')).toBeLessThan(storage.body.indexOf('Right'));
    expect(storage.degraded).toBe(false);
    const html = await renderStaticHtml(document, context);
    expect(html.body).toContain('ywtc-layout-columns-3');
    expect(html.degraded).toBe(false);
    const markdown = await renderMarkdown(document, context);
    expect(markdown.body).toContain('### Column 1');
    expect(markdown.body).toContain('### Column 3');
    expect(markdown.degraded).toBe(false);
    expect(markdown.warnings).toEqual([]);
    expect(markdown.adaptations).toContainEqual(expect.stringContaining('linearized'));
  });

  it('maps supported Confluence layouts and macros to native YFM constructs', async () => {
    const page = source([
      '<ac:layout><ac:layout-section ac:type="two_equal">',
      '<ac:layout-cell><ac:structured-macro ac:name="info"><ac:parameter ac:name="title">Read me</ac:parameter><ac:rich-text-body><p>Left</p></ac:rich-text-body></ac:structured-macro></ac:layout-cell>',
      '<ac:layout-cell><ac:structured-macro ac:name="expand"><ac:parameter ac:name="title">More</ac:parameter><ac:rich-text-body><p>Right</p></ac:rich-text-body></ac:structured-macro></ac:layout-cell>',
      '</ac:layout-section></ac:layout>',
      '<ac:task-list><ac:task><ac:task-status>complete</ac:task-status><ac:task-body>Done</ac:task-body></ac:task></ac:task-list>',
      '<ac:structured-macro ac:name="code"><ac:parameter ac:name="language">typescript</ac:parameter><ac:plain-text-body><![CDATA[const x = 1;]]></ac:plain-text-body></ac:structured-macro>',
      '<ac:structured-macro ac:name="children"><ac:parameter ac:name="depth">2</ac:parameter><ac:parameter ac:name="sort">title</ac:parameter></ac:structured-macro>',
      '<ac:structured-macro ac:name="anchor"><ac:parameter ac:name="">part</ac:parameter></ac:structured-macro>',
    ].join(''), 'confluence-storage');
    const document = normalizePageContent(page);
    const context: RenderContext = {
      pages: new Map(), resources: new Map(), sourcePages: new Map([[page.canonicalId, page]]), currentPageId: page.canonicalId,
    };
    const yfm = await renderYfm(document, context);
    expect(yfm.body).toContain('{% layout %}');
    expect(yfm.body.match(/{% block %}/g)).toHaveLength(2);
    expect(yfm.body).toContain('{% note info "Read me" %}');
    expect(yfm.body).toContain('{% cut "More" %}');
    expect(yfm.body).toContain('- [x] Done');
    expect(yfm.body).toContain('```typescript');
    expect(yfm.body).toContain('{% tree depth="2" sort_by="title" sort="asc" %}');
    expect(yfm.body).toContain('<a id="part"></a>');
    expect(yfm.degraded).toBe(false);
  });

  it('preserves invalid or unequal Confluence layout content as a complete adaptation', async () => {
    const page = source('<ac:layout><ac:layout-section ac:type="two_left_sidebar"><ac:layout-cell><p>Narrow</p></ac:layout-cell><ac:layout-cell><p>Wide</p></ac:layout-cell></ac:layout-section><ac:layout-section ac:type="unknown"><ac:layout-cell><p>Other</p></ac:layout-cell></ac:layout-section></ac:layout>', 'confluence-storage');
    const document = normalizePageContent(page);
    const context: RenderContext = {
      pages: new Map(), resources: new Map(), sourcePages: new Map([[page.canonicalId, page]]), currentPageId: page.canonicalId,
    };
    expect(document.warnings).toEqual([]);
    expect(document.adaptations).toContainEqual(expect.stringContaining('adaptive widths'));
    expect(normalizedPreviewHtml(document)).toContain('Narrow');
    expect(normalizedPreviewHtml(document)).toContain('Other');
    const yfm = await renderYfm(document, context);
    expect(yfm.body).toContain('Narrow');
    expect(yfm.body).toContain('Wide');
    expect(yfm.body).toContain('Other');
    expect(yfm.warnings).toEqual([]);
    expect(yfm.adaptations).toContainEqual(expect.stringContaining('equal YFM columns'));
    expect(yfm.degraded).toBe(false);
  });

  it('verifies native layouts structurally without confusing provider padding with loss', () => {
    const page = source('Body');
    const expected = '<ac:layout><ac:layout-section ac:type="two_equal"><ac:layout-cell><p>Left</p></ac:layout-cell><ac:layout-cell><p>Right</p></ac:layout-cell></ac:layout-section></ac:layout>';
    const padded = '<ac:layout><ac:layout-section ac:type="two_equal"><ac:layout-cell><p>Left</p><p></p></ac:layout-cell><ac:layout-cell><p>Right</p></ac:layout-cell></ac:layout-section></ac:layout>';
    expect(verifyDestinationContent(expected, padded, 'confluence', page).status).toBe('complete');
    expect(verifyDestinationContent(expected, '<p>Left</p><p>Right</p>', 'confluence', page)).toMatchObject({status: 'complete', adaptations: [expect.stringContaining('layout')]});
    expect(verifyDestinationContent(expected, '<ac:layout><ac:layout-section ac:type="two_equal"><ac:layout-cell><p>Left</p></ac:layout-cell><ac:layout-cell></ac:layout-cell></ac:layout-section></ac:layout>', 'confluence', page).status).toBe('failed');
  });

  it('normalizes provider whitespace only at semantic block boundaries', () => {
    const page = source('Body');
    const expected = '<h2>Title</h2>\n<p>image.png</p>\n<p>🚫 Blocked</p><table><tbody><tr><td><p>Cell</p><p>Detail</p></td></tr></tbody></table>';
    const providerSerialized = '<h2>Title</h2><p>image.png</p><p>🚫 Blocked</p><table><tbody><tr><td><p>Cell</p><p>Detail</p></td></tr></tbody></table>';
    expect(verifyDestinationContent(expected, providerSerialized, 'confluence', page))
      .toEqual({status: 'complete', differences: [], adaptations: []});

    expect(verifyDestinationContent('<p>foo<strong>bar</strong></p>', '<p>foo <strong>bar</strong></p>', 'confluence', page).status)
      .toBe('failed');
    expect(verifyDestinationContent('<p>alpha</p><p>beta</p>', '<p>alphabeta</p>', 'confluence', page).status)
      .toBe('failed');
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
    try {
      assertDestinationContent(fallback.body, '<p>Full source</p>', 'confluence', page);
      throw new Error('Expected destination verification to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(DestinationContentVerificationError);
      expect((error as DestinationContentVerificationError).result).toMatchObject({status: 'failed'});
    }
    expect(() => assertDestinationContent(
      fallback.body,
      legacyTransferPlaceholder('confluence', page),
      'confluence',
      page,
    )).toThrow(/transfer placeholder/);
  });

  it('describes recognized normalized constructs when an empty renderer needs a raw fallback', () => {
    const document = normalizePageContent(source('{% tree depth="2" %}'));
    expect(emptyRendererFallbackReason(document)).toContain('tree-directive');
    expect(rawContentFallback(source('{% tree depth="2" %}'), 'confluence', emptyRendererFallbackReason(document)).warnings[0]).toContain('tree-directive');
  });
});

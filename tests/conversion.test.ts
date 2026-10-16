import {describe, expect, it} from 'vitest';
import {convertGridToStorage, convertYfmToStorage, createAttachmentReferenceMap} from '../src/conversion.js';
import type {ConversionContext} from '../src/conversion.js';

function context(): ConversionContext {
  return {
    currentSlug: 'root',
    spaceKey: 'DOC',
    wikiWebUrl: 'https://wiki.yandex.ru',
    pagesBySlug: new Map([
      ['root/child', {sourceId: 2, slug: 'root/child', destinationTitle: 'Child'}],
    ]),
    attachmentsByReference: createAttachmentReferenceMap([
      {sourceName: 'image.png', destinationName: 'image.png'},
      {sourceName: 'guide.pdf', destinationName: 'guide.pdf'},
    ]),
  };
}

describe('YFM conversion', () => {
  it('converts rich YFM, page links, attachments, images, notes, cuts, and code', () => {
    const source = [
      '# Header {#manual}',
      '',
      '{% note warning "Careful" %}',
      '',
      'Text **bold**',
      '',
      '{% endnote %}',
      '',
      '{% cut "Details" %}',
      '',
      'Hidden',
      '',
      '{% endcut %}',
      '',
      '![Alt](image.png){width=100}',
      '',
      '[Child](/root/child#part) and [PDF](guide.pdf)',
      '',
      '```ts',
      'const x = 1;',
      '```',
    ].join('\n');
    const result = convertYfmToStorage(source, context());

    expect(result.storage).toContain('ac:name="anchor"');
    expect(result.storage).toContain('ac:name="warning"');
    expect(result.storage).toContain('ac:name="expand"');
    expect(result.storage).toContain('ri:filename="image.png"');
    expect(result.storage).toContain('ri:content-title="Child"');
    expect(result.storage).toContain('ri:filename="guide.pdf"');
    expect(result.storage).toContain('ac:name="code"');
    expect(result.storage).not.toContain('<button');
    expect(result.stats).toMatchObject({
      internalPageLinks: 1,
      attachmentLinks: 1,
      attachedImages: 1,
      codeBlocks: 1,
    });
  });

  it('converts dynamic grids to static tables', () => {
    const result = convertGridToStorage({
      id: 'grid-1',
      title: 'Owners',
      structure: {columns: [{slug: 'name', title: 'Name'}, {slug: 'done', title: 'Done'}]},
      rows: [{id: 'row-1', row: ['Alice', true]}],
    }, context());

    expect(result.storage).toContain('<table>');
    expect(result.storage).toContain('<th>Name</th>');
    expect(result.storage).toContain('<td>Alice</td>');
    expect(result.warnings[0]).toMatch(/static table/);
    expect(result.stats.tables).toBe(1);
  });

  it('preserves bare links, legacy text colors, task items, anchors and ordered-list starts', () => {
    const source = [
      '{gray}(Muted text) and https://example.com/path?a=1',
      '',
      '[{gray}(Mail)](mailto:test@example.com)',
      '',
      '[ ] Verify migration',
      '[x] Already done',
      '',
      '<p id="manual-anchor">Anchored</p>',
      '',
      '2. second',
      '3. third',
      '',
      '&nbsp;',
    ].join('\n');
    const result = convertYfmToStorage(source, context());

    expect(result.storage).toContain('<span style="color: #6b778c;">Muted text</span>');
    expect(result.storage).toContain('<a href="https://example.com/path?a=1">https://example.com/path?a=1</a>');
    expect(result.storage).toContain('<a href="mailto:test@example.com"><span style="color: #6b778c;">Mail</span></a>');
    expect(result.storage).toContain('<ac:task-status>incomplete</ac:task-status>');
    expect(result.storage).toContain('<ac:task-status>complete</ac:task-status>');
    expect(result.storage).toContain('<ac:parameter ac:name="">manual-anchor</ac:parameter>');
    expect(result.storage).toContain('<ol start="2">');
    expect(result.storage).not.toContain('{gray}');
    expect(result.storage).not.toContain('&amp;nbsp;');
    expect(result.stats.externalLinks).toBe(2);
  });

  it('emits documented native Confluence page layouts before Diplodoc can flatten blocks', () => {
    const source = [
      'Before',
      '{% layout gap=l %}',
      '{% block %}', 'One', '{% endblock %}',
      '{% block %}', 'Two', '{% endblock %}',
      '{% block %}', 'Three', '{% endblock %}',
      '{% block %}', 'Four', '{% endblock %}',
      '{% endlayout %}',
      'After',
    ].join('\n');
    const result = convertYfmToStorage(source, context());
    expect(result.storage).toMatch(/^<ac:layout>/);
    expect(result.storage).toContain('ac:type="single"');
    expect(result.storage).toContain('ac:type="three_equal"');
    expect(result.storage.match(/<ac:layout-cell>/g)).toHaveLength(6);
    expect(result.storage.indexOf('One')).toBeLessThan(result.storage.indexOf('Four'));
    expect(result.warnings).toContainEqual(expect.stringContaining('split into Confluence rows'));
  });
});

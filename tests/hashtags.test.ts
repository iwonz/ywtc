import {describe, expect, it, vi} from 'vitest';
import {parseCliArguments} from '../src/cli-arguments.js';
import {parseWorkspaceConfig} from '../src/config.js';
import {hashtagPresentation, parseHashtagDecisions} from '../src/hashtag-decisions.js';
import {normalizePageContent, renderConfluenceStorage, renderMarkdown, renderStaticHtml, renderYfm} from '../src/content-model.js';
import type {RenderContext, SourcePage} from '../src/domain.js';
import {normalizeCommentForest, renderCommentArchive, verifyCommentArchive} from '../src/comments.js';
import {mkdtemp, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {loadHashtagPolicy} from '../src/hashtag-policy.js';
import {hashtagPolicyFingerprint} from '../src/hashtags.js';

const source = {provider: 'yandex-wiki', instance: 'https://wiki.example.com'};

describe('hashtag public contract', () => {
  it('adds a source-only export with existing aliases', () => {
    expect(() => parseCliArguments(['hashtags', 'export', '-s', 'root', '-o', './tags', '-N'])).not.toThrow();
    expect(parseCliArguments(['hashtags', 'export', '-s', 'root', '-o', './tags', '-N'])).toMatchObject({command: 'hashtags-export', comments: false, scope: 'subtree', sourceStatus: 'all'});
  });
  it('accepts independent off policy without a file', () => {
    expect(() => parseWorkspaceConfig({hashtags: {mode: 'off'}, connections: {wiki: {type: 'yandex-wiki', apiUrl: 'https://api.example.com', webUrl: 'https://wiki.example.com', organization: {id: '1'}}}}, '/tmp/ywtc.config.yaml')).not.toThrow();
  });
});

describe('hashtag decisions and shared scanner', () => {
  it('pins case-sensitive literal decisions and rejects unsafe or incompatible fields', () => {
    const document = parseHashtagDecisions({source, entries: [{tag: '#Tag', decision: 'text', text: '@literal #output'}, {tag: '#tag', decision: 'url', url: 'https://example.com/{literal}'}]});
    expect(hashtagPresentation('#Tag', {mode: 'mapping', document})).toEqual({outcome: 'text', label: '@literal #output'});
    expect(hashtagPresentation('#tag', {mode: 'mapping', document})).toMatchObject({outcome: 'linked', label: '#tag'});
    expect(hashtagPresentation('#absent', {mode: 'mapping', document}).outcome).toBe('preserved');
    for (const entries of [[{tag: '#t', decision: 'skip', text: 'x'}], [{tag: '#t', decision: 'url', url: 'javascript:alert(1)'}], [{tag: '#t', decision: 'text', text: ' '}], [{tag: '#t', decision: 'skip'}, {tag: '#t', decision: 'skip'}]]) expect(() => parseHashtagDecisions({source, entries})).toThrow();
  });
  it('recognizes only original safe text and whole links in both formats', async () => {
    const api = await import('../src/hashtags.js').catch(() => undefined);
    expect(api, 'shared hashtag scanner is implemented').toBeDefined();
    if (!api) return;
    const input = '#Topic (#тег) #é #123 #_\n# Heading {#anchor}\n##mono## \u0060#code\u0060 \\#escape https://example.com/#fragment\n[#linked](https://example.com/#ignore) [mixed #ignored](https://example.com) ![#alt](image.png)\n{% diagram %}\n#diagram\n{% enddiagram %}\n<span title="#attribute">#visible</span>';
    expect(api.scanHashtags(input, 'yfm').hashtags.map(item => item.tag)).toEqual(['#Topic', '#тег', '#é', '#123', '#linked', '#visible']);
    expect(api.scanHashtags('<p>#plain <a href="https://example.com"><b>#linked</b></a><a href="/x">mixed #ignored</a><code>#code</code><ac:parameter>#parameter</ac:parameter></p>', 'confluence-storage').hashtags.map(item => item.tag)).toEqual(['#plain', '#linked']);
    expect(api.scanHashtags('**#bold** _#under_score_ ~~#strike~~ https://example.com/(#fragment) data:abc,(#payload)', 'yfm').hashtags.map(item => item.tag)).toEqual(['#bold', '#under_score', '#strike']);
    expect(api.scanHashtags('[broken\n#real\n1 < 2 #comparison\n[#reference][ref]', 'yfm').hashtags.map(item => item.tag)).toEqual(['#real', '#comparison', '#reference']);
  });
  it('bounds work on huge payloads and malformed syntax', async () => {
    const api = await import('../src/hashtags.js').catch(() => undefined);expect(api).toBeDefined();if (!api) return;
    const input = `data:image/png;base64,${'A'.repeat(1_100_000)}\n${'#'.repeat(20_000)}\n#last`;
    const started = performance.now();expect(api.scanHashtags(input, 'yfm').hashtags.map(item => item.tag)).toEqual(['#last']);expect(performance.now() - started).toBeLessThan(1500);
  });
  it.each(['yfm', 'confluence-storage'] as const)('renders literal decisions in every output from %s without mutating cached source', async format => {
    const page: SourcePage = {provider: format === 'yfm' ? 'yandex-wiki' : 'confluence', profile: 'source', id: '1', canonicalId: 'source:1', locator: 'a', title: 'Page', url: 'https://wiki.example.com/a', rawFormat: format, rawContent: format === 'yfm' ? '#old [#link](https://old.example.com) @ivan' : '<p>#old <a href="https://old.example.com">#link</a><ac:link><ri:user ri:username="ivan"/></ac:link></p>', references: []};
    const document = normalizePageContent(page), before = JSON.stringify(document);
    const context: RenderContext = {currentPageId: page.canonicalId, pages: new Map(), resources: new Map(), sourcePages: new Map([[page.canonicalId, page]]), hashtagPolicy: {mode: 'mapping', document: parseHashtagDecisions({source, entries: [{tag: '#old', decision: 'text', text: '@literal #new'}, {tag: '#link', decision: 'url', url: page.url, text: 'Target'}]})}, mentions: new Map((document.mentions ?? []).map(item => [item.id, {outcome: 'linked', label: '#old', url: 'https://people.example.com', retryable: false}]))};
    for (const rendered of [await renderConfluenceStorage(document, page, context, 'S'), await renderStaticHtml(document, context), await renderMarkdown(document, context), await renderYfm(document, context)]) {
      expect(rendered.body).toContain('literal');expect(rendered.body).toContain('Target');expect(rendered.body).not.toContain('https://old.example.com');expect(rendered.body).not.toContain('YWTCHASHTAG');expect(rendered.body).toContain('https://people.example.com');
    }
    expect(JSON.stringify(document)).toBe(before);
  });
  it('applies decisions to archived comments and verifies the transformed representation', () => {
    const inventory = normalizeCommentForest([{id: 'c', author: {providerId: 'a', displayName: 'Author'}, body: '#old', inlineContext: '#old'}], 'yfm');
    const hashtagPolicy = {mode: 'mapping' as const, document: parseHashtagDecisions({source, entries: [{tag: '#old', decision: 'text', text: 'Replacement'}]})};
    const body = renderCommentArchive(inventory, 'confluence', {sourceUrl: 'https://wiki.example.com', hashtagPolicy});
    expect(body).toContain('Replacement');expect(body).not.toContain('#old');
    expect(verifyCommentArchive(inventory, body, undefined, {mode: 'off'}, hashtagPolicy).ok).toBe(true);
  });
  it('pins relative mapping files and rejects a foreign source before provider access', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ywtc-hashtag-policy-'));
    const filename = path.join(root, 'decisions.json');
    await writeFile(filename, JSON.stringify({source, entries: [{tag: '#tag', decision: 'text', text: 'One'}]}));
    const config = parseWorkspaceConfig({hashtags: {mode: 'mapping', mappingFile: './decisions.json'}, connections: {wiki: {type: 'yandex-wiki', apiUrl: 'https://api.example.com', webUrl: source.instance, organization: {id: '1'}}}}, path.join(root, 'ywtc.config.yaml'));
    const policy = loadHashtagPolicy(config, config.profiles.wiki);await writeFile(filename, '{}');
    expect(Object.isFrozen(policy)).toBe(true);expect(hashtagPresentation('#tag', policy).label).toBe('One');
    expect(hashtagPolicyFingerprint(policy, '#tag', 'yfm')).not.toBe('');expect(hashtagPolicyFingerprint(policy, '#unrelated', 'yfm')).toBe('');
    await writeFile(filename, JSON.stringify({source, entries: []}));config.hashtags = {mode: 'mapping', mappingFile: filename};expect(loadHashtagPolicy(config).mode).toBe('mapping');
    const home = vi.spyOn(os, 'homedir').mockReturnValue(root);try {config.hashtags = {mode: 'mapping', mappingFile: '~/decisions.json'};expect(loadHashtagPolicy(config).mode).toBe('mapping');} finally {home.mockRestore();}
    config.hashtags = {mode: 'mapping', mappingFile: filename};
    await writeFile(filename, JSON.stringify({source: {...source, instance: 'https://other.example.com'}, entries: []}));
    expect(() => loadHashtagPolicy(config, config.profiles.wiki)).toThrow(/source.instance/);
    config.hashtags = {mode: 'off'};expect(loadHashtagPolicy(config)).toEqual({mode: 'off'});
  });
  it('does not map macro parameters when equivalent body tags are converted', async () => {
    const page: SourcePage = {provider: 'confluence', profile: 'source', id: '1', canonicalId: 'source:1', locator: 'a', title: 'Page', url: 'https://wiki.example.com/a', rawFormat: 'confluence-storage', rawContent: '<ac:structured-macro ac:name="expand"><ac:parameter ac:name="title">#tag</ac:parameter><ac:rich-text-body><p>#tag</p></ac:rich-text-body></ac:structured-macro>', references: []};
    const context: RenderContext = {currentPageId: page.canonicalId, pages: new Map(), resources: new Map(), sourcePages: new Map(), hashtagPolicy: {mode: 'mapping', document: parseHashtagDecisions({source, entries: [{tag: '#tag', decision: 'text', text: 'Replacement'}]})}};
    const html = (await renderStaticHtml(normalizePageContent(page), context)).body;
    expect(html).toContain('<summary>#tag</summary>');expect(html).toContain('<p>Replacement</p>');
  });
});

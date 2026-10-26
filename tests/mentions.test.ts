import {createHash} from 'node:crypto';
import {describe, expect, it} from 'vitest';
import {ConfigurationError, parseWorkspaceConfig} from '../src/config.js';
import {normalizePageContent, renderConfluenceStorage, renderMarkdown, renderStaticHtml, renderYfm, verifyDestinationContent} from '../src/content-model.js';
import type {MentionIdentity, MentionProcessingPolicy, RenderContext, SourcePage} from '../src/domain.js';
import {
  mentionPolicyFingerprint,
  prepareMentionPresentation,
  protectYfmMentions,
  resolveMentionPresentations,
} from '../src/mentions.js';

const config = (mentions?: unknown): unknown => ({
  defaults: {},
  ...(mentions === undefined ? {} : {mentions}),
  connections: {
    wiki: {
      type: 'yandex-wiki', apiUrl: 'https://api.wiki.yandex.net/v1', webUrl: 'https://wiki.example.com',
      authType: 'oauth', token: 'secret', organization: {type: 'yandex360', id: '1'},
    },
  },
});

describe('current mention decisions', () => {
  it('defaults off and rejects removed modes and fields', () => {
    expect(parseWorkspaceConfig(config(), '/tmp/ywtc.config.yaml').mentions).toEqual({mode: 'off'});
    for (const policy of [{mode: 'auto'}, {mode: 'template'}, {mode: 'off', textTemplate: '{source}'}]) {
      expect(() => parseWorkspaceConfig(config(policy), '/tmp/ywtc.config.yaml')).toThrow(ConfigurationError);
    }
  });
  it('uses explicit decisions without lookup and hashes effective values only', async () => {
    const identity: MentionIdentity = {source: '@{ivan}', username: 'ivan'};
    const policy: MentionProcessingPolicy = {mode: 'mapping', document: {
      source: {provider: 'yandex-wiki', instance: 'https://wiki.example.com'},
      entries: [{identity: {username: 'ivan'}, mention: '@ivan', decision: 'url', url: 'https://people.example.com/ivan', text: 'Ivan <admin>'}],
    }};
    expect(prepareMentionPresentation(identity, policy)).toMatchObject({outcome: 'linked', label: 'Ivan <admin>'});
    expect((await resolveMentionPresentations([{id: '1', identity}], {mode: 'off'})).get('1')).toMatchObject({outcome: 'preserved', label: '@{ivan}'});
    const changed = structuredClone(policy);
    if (changed.mode === 'mapping') changed.document.entries.unshift({identity: {username: 'unrelated'}, mention: '@unrelated', decision: 'skip'});
    expect(mentionPolicyFingerprint(policy, [identity])).toBe(mentionPolicyFingerprint(changed, [identity]));
  });
});

describe('bounded YFM mention recognition', () => {
  it('protects plain and braced mentions while excluding unsafe contexts', () => {
    const input = 'Hi @ivan. and @{maria}; mail ivan@example.com; https://example.com/@path; \\@escaped; `@inline`.\n\n```text\n@fenced\n```';
    const result = protectYfmMentions(input);
    expect(result.mentions.map((mention) => mention.identity.source)).toEqual(['@ivan', '@{maria}']);
    expect(result.content).not.toContain('@{maria}');
    expect(result.restore(result.content)).toBe(input);
  });

  it('supports Unicode identities and ignores HTML attributes and diagram source', () => {
    const source = '<span data-owner="@attribute">Visible @иван</span>\n\n```mermaid\nA[@diagram] --> B\n```\n\n{% diagram %}\n@startuml\nAlice -> Bob\n@enduml\n{% enddiagram %}';
    const page: SourcePage = {
      provider: 'yandex-wiki', profile: 'wiki', id: '1', canonicalId: 'wiki:1', title: 'Mentions',
      locator: 'mentions', url: 'https://wiki.example/mentions', rawFormat: 'yfm', references: [], rawContent: source,
    };
    const document = normalizePageContent(page);

    expect(document.mentions?.map((mention) => mention.identity.username)).toEqual(['иван']);
    expect(document.raw).toBe(source);
  });

  it('scans megabyte content without copying protected inline payloads into mention identities', () => {
    const input = `data:image/png;base64,${'A'.repeat(1_100_000)}\nHello @user`;
    const started = performance.now();
    const result = protectYfmMentions(input);
    expect(result.mentions).toHaveLength(1);
    expect(result.mentions[0]?.identity.username).toBe('user');
    expect(performance.now() - started).toBeLessThan(1_000);
  });

  it('does not rewrite source text that resembles an internal marker', () => {
    const seed = 'Hello @ivan';
    const namespace = createHash('sha256').update(seed).digest('hex').slice(0, 16).toUpperCase();
    const collision = `YWTCMENTION${namespace}0TOKEN`;
    const input = `${seed}\n${collision}`;
    const result = protectYfmMentions(input);

    expect(result.mentions).toHaveLength(1);
    expect(result.mentions[0]?.marker).not.toBe(collision);
    expect(result.restore(result.content)).toBe(input);
  });
});

describe('mention normalization and rendering', () => {
  it('keeps literal mapping URLs outside ordinary page-link rewriting', async () => {
    const source = page('Hello @ivan'), document = normalizePageContent(source), renderContext = context(source);
    renderContext.pages.set(source.canonicalId, {path: 'destination.md', title: 'Moved'});
    renderContext.mentions!.set(document.mentions![0]!.id, {outcome: 'linked', label: 'Ivan', url: source.url, retryable: false});
    expect((await renderMarkdown(document, renderContext)).body).toContain(source.url);
    expect((await renderStaticHtml(document, renderContext)).body).toContain(source.url);
  });
  const page = (rawContent: string, rawFormat: SourcePage['rawFormat'] = 'yfm'): SourcePage => ({
    provider: rawFormat === 'yfm' ? 'yandex-wiki' : 'confluence', profile: 'source', id: '1', canonicalId: 'source:1',
    title: 'Mentions', locator: 'mentions', url: 'https://wiki.example.com/mentions', rawContent, rawFormat, references: [],
  });
  const context = (source: SourcePage): RenderContext => ({
    pages: new Map(), resources: new Map(), sourcePages: new Map([[source.canonicalId, source]]), currentPageId: source.canonicalId,
    mentions: new Map(),
  });

  it('preserves braced YFM mentions through normalization when processing is off', async () => {
    const source = page('Hello @{ivan} and @maria');
    const document = normalizePageContent(source);
    const rendered = await renderConfluenceStorage(document, source, context(source), 'DOC');
    expect(document.mentions?.map((mention) => mention.identity.source)).toEqual(['@{ivan}', '@maria']);
    expect(document.metrics.mentions).toBe(2);
    expect(rendered.body).toContain('@{ivan}');
    expect(rendered.body).toContain('@maria');
    expect(rendered.mentions).toMatchObject({preserved: 2});
  });

  it('renders configured mention links in Markdown and static HTML', async () => {
    const source = page('Hello @ivan');
    const document = normalizePageContent(source);
    const renderContext = context(source);
    const mention = document.mentions![0]!;
    renderContext.mentions!.set(mention.id, {outcome: 'linked', label: 'Ivan Petrov', url: 'https://profiles.example.com/ivan', retryable: false});
    await expect(renderMarkdown(document, renderContext)).resolves.toMatchObject({
      body: expect.stringContaining('[Ivan Petrov](https://profiles.example.com/ivan)'), mentions: {linked: 1},
    });
    await expect(renderStaticHtml(document, renderContext)).resolves.toMatchObject({
      body: expect.stringContaining('<a href="https://profiles.example.com/ivan">Ivan Petrov</a>'), mentions: {linked: 1},
    });
  });

  it('escapes configured display text instead of interpreting it as YFM markup', async () => {
    const source = page('Hello @ivan');
    const document = normalizePageContent(source);
    const renderContext = context(source);
    renderContext.mentions!.set(document.mentions![0]!.id, {
      outcome: 'linked', label: '[Ivan] *admin*', url: 'https://profiles.example.com/ivan', retryable: false,
    });

    await expect(renderYfm(document, renderContext)).resolves.toMatchObject({
      body: expect.stringContaining('[\\[Ivan\\] \\*admin\\*](https://profiles.example.com/ivan)'),
    });
  });

  it('normalizes Confluence ri:user and renders safe YFM fallback', async () => {
    const source = page('<p>Hello <ac:link><ri:user ri:account-id="abc"/><ac:plain-text-link-body><![CDATA[Ivan]]></ac:plain-text-link-body></ac:link></p>', 'confluence-storage');
    const document = normalizePageContent(source);
    expect(document.mentions).toHaveLength(1);
    expect(document.mentions![0]?.identity).toMatchObject({source: 'Ivan', displayName: 'Ivan', accountId: 'abc'});
    const renderContext = context(source);
    renderContext.mentions!.set(document.mentions![0]!.id, {outcome: 'linked', label: 'Ivan', url: 'https://profiles.example.com/ivan', retryable: false});
    const rendered = await renderYfm(document, renderContext);
    expect(rendered.body).toContain('[Ivan](https://profiles.example.com/ivan)');
    expect(rendered.body).not.toContain('ri:user');
  });

  it('structurally reads adjacent Confluence username and user-key mentions', () => {
    const source = page('<p>Owners: <ac:link><ri:user ri:username="ivan"/></ac:link>, <strong>and</strong> <ac:link><ri:user ri:userkey="key-42"/></ac:link>.</p>', 'confluence-storage');
    const document = normalizePageContent(source);

    expect(document.mentions?.map((mention) => mention.identity)).toEqual([
      expect.objectContaining({source: '@ivan', username: 'ivan'}),
      expect.objectContaining({source: 'key-42', userKey: 'key-42', id: 'key-42'}),
    ]);
  });

  it('renders decisions as ordinary links, never new native users', async () => {
    const source = page('Hello @ivan'), document = normalizePageContent(source), renderContext = context(source);
    renderContext.mentions!.set(document.mentions![0]!.id, {
      outcome: 'linked', label: '@ivan', url: 'https://people.example/ivan', retryable: false,
    });
    const confluence = await renderConfluenceStorage(document, source, renderContext, 'DOC');
    expect(confluence.body).toContain('https://people.example/ivan');
    expect(confluence.body).not.toContain('ri:user');
    expect(verifyDestinationContent(confluence.body, confluence.body, 'confluence', source)).toMatchObject({status: 'complete'});
  });
});

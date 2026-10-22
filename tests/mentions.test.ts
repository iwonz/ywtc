import {createHash} from 'node:crypto';
import {describe, expect, it} from 'vitest';
import {ConfigurationError, parseWorkspaceConfig} from '../src/config.js';
import {
  mentionPolicyFingerprint,
  prepareMentionPresentation,
  protectYfmMentions,
  resolveMentionPresentations,
} from '../src/mentions.js';
import type {MentionIdentity, MentionPolicy} from '../src/domain.js';
import type {RenderContext, SourcePage} from '../src/domain.js';
import {normalizePageContent, renderConfluenceStorage, renderMarkdown, renderStaticHtml, renderYfm, verifyDestinationContent} from '../src/content-model.js';

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

describe('mention configuration', () => {
  it('defaults to off and accepts strict template and auto policies', () => {
    expect(parseWorkspaceConfig(config(), '/tmp/ywtc.config.yaml').mentions).toEqual({mode: 'off'});
    expect(parseWorkspaceConfig(config({
      mode: 'template', textTemplate: '{name}', urlTemplate: 'https://profiles.example.com/{username}',
    }), '/tmp/ywtc.config.yaml').mentions).toEqual({
      mode: 'template', textTemplate: '{name}', urlTemplate: 'https://profiles.example.com/{username}', aliases: {},
    });
    expect(parseWorkspaceConfig(config({
      mode: 'auto', textTemplate: '{source}', aliases: {'username:ivan': {username: 'i.petrov', accountId: 'abc'}},
    }), '/tmp/ywtc.config.yaml').mentions).toMatchObject({
      mode: 'auto', textTemplate: '{source}', aliases: {'username:ivan': {username: 'i.petrov', accountId: 'abc'}},
    });
  });

  it.each([
    [{mode: 'template', textTemplate: '{unknown}'}, 'mentions.textTemplate'],
    [{mode: 'template', textTemplate: '{name', urlTemplate: 'https://example.com/{username}'}, 'mentions.textTemplate'],
    [{mode: 'template', textTemplate: '{name}', urlTemplate: 'javascript:{username}'}, 'mentions.urlTemplate'],
    [{mode: 'auto', textTemplate: '{source}', aliases: {'login:ivan': {username: 'ivan'}}}, 'mentions.aliases.login:ivan'],
    [{mode: 'off', textTemplate: '{source}'}, 'mentions.textTemplate'],
  ])('rejects invalid mention configuration %#', (mentions, field) => {
    expect(() => parseWorkspaceConfig(config(mentions), '/tmp/ywtc.config.yaml')).toThrowError(ConfigurationError);
    try {
      parseWorkspaceConfig(config(mentions), '/tmp/ywtc.config.yaml');
    } catch (error) {
      expect((error as ConfigurationError).fields).toContain(field);
    }
  });
});

describe('mention presentation', () => {
  const identity: MentionIdentity = {source: '@{ivan}', username: 'ivan', displayName: 'Ivan Petrov', id: '42'};

  it('renders escaped text and an encoded safe profile URL', () => {
    const policy: MentionPolicy = {mode: 'template', textTemplate: '{displayName} <{username}>', urlTemplate: 'https://profiles.example.com/{username}', aliases: {}};
    expect(prepareMentionPresentation(identity, policy, {native: false})).toEqual({
      outcome: 'linked', label: 'Ivan Petrov <ivan>', url: 'https://profiles.example.com/ivan', retryable: false,
    });
  });

  it('performs no destination lookup when processing is off', async () => {
    const destination = {resolveMention: async () => { throw new Error('lookup must not run'); }};
    const result = await resolveMentionPresentations([{id: 'one', identity}], {mode: 'off'}, destination);

    expect(result.get('one')).toEqual({outcome: 'preserved', label: '@{ivan}', retryable: false});
  });

  it('preserves the source and reports unresolved when required values are missing', () => {
    const policy: MentionPolicy = {mode: 'auto', textTemplate: '{email}', aliases: {}};
    expect(prepareMentionPresentation(identity, policy, {native: true, status: 'not-found'})).toEqual({
      outcome: 'unresolved', label: '@{ivan}', reason: 'missing-template-value:email', retryable: false,
    });
  });

  it('produces a stable policy fingerprint independent of alias insertion order', () => {
    const left: MentionPolicy = {mode: 'auto', textTemplate: '{source}', aliases: {
      'username:b': {username: 'b2'}, 'username:a': {username: 'a2'},
    }};
    const right: MentionPolicy = {mode: 'auto', textTemplate: '{source}', aliases: {
      'username:a': {username: 'a2'}, 'username:b': {username: 'b2'},
    }};
    expect(mentionPolicyFingerprint(left)).toBe(mentionPolicyFingerprint(right));
  });

  it('deduplicates destination lookup and verifies aliases before rendering native mentions', async () => {
    const policy: MentionPolicy = {mode: 'auto', textTemplate: '{source}', aliases: {
      'username:ivan': {username: 'i.petrov', accountId: 'cloud-42'},
    }};
    let calls = 0;
    const destination = {
      resolveMention: async (value: MentionIdentity) => {
        calls += 1;
        expect(value).toMatchObject({username: 'i.petrov', accountId: 'cloud-42'});
        return {status: 'resolved' as const, user: {username: 'i.petrov', accountId: 'cloud-42'}};
      },
    };
    const results = await resolveMentionPresentations([
      {id: 'one', identity}, {id: 'two', identity: {...identity, source: '@ivan'}},
    ], policy, destination);
    expect(calls).toBe(1);
    expect([...results.values()]).toEqual([
      expect.objectContaining({outcome: 'native'}), expect.objectContaining({outcome: 'native'}),
    ]);
  });

  it('uses any matching source alias before immutable-ID lookup', async () => {
    const policy: MentionPolicy = {mode: 'auto', textTemplate: '{source}', aliases: {
      'username:ivan': {accountId: 'destination-42'},
    }};
    const destination = {
      resolveMention: async (value: MentionIdentity) => {
        expect(value.accountId).toBe('destination-42');
        return {status: 'resolved' as const, user: {accountId: 'destination-42'}};
      },
    };

    const results = await resolveMentionPresentations([
      {id: 'one', identity: {...identity, accountId: 'source-42'}},
    ], policy, destination);

    expect(results.get('one')).toMatchObject({outcome: 'native', user: {accountId: 'destination-42'}});
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

  it('renders verified native users for Confluence and Yandex destinations', async () => {
    const source = page('Hello @ivan');
    const document = normalizePageContent(source);
    const renderContext = context(source);
    renderContext.mentions!.set(document.mentions![0]!.id, {
      outcome: 'native', label: 'Ivan', user: {username: 'i.petrov', accountId: 'cloud-42'}, retryable: false,
    });
    const confluence = await renderConfluenceStorage(document, source, renderContext, 'DOC');
    expect(confluence.body).toContain('<ri:user ri:account-id="cloud-42"/>');
    expect(confluence.mentions).toMatchObject({native: 1});
    const yfm = await renderYfm(document, renderContext);
    expect(yfm.body).toContain('@i.petrov');
    expect(yfm.mentions).toMatchObject({native: 1});
    expect(verifyDestinationContent(confluence.body, '<p>Hello Ivan</p>', 'confluence', source)).toMatchObject({status: 'failed'});
    expect(verifyDestinationContent(confluence.body, confluence.body, 'confluence', source)).toMatchObject({status: 'complete'});
  });
});

import {mkdtemp, readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import nock from 'nock';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {DataCenterConfluenceClient} from '../src/clients/confluence.js';
import {CloudConfluenceClient} from '../src/clients/confluence-cloud.js';
import {ConfluenceAdapter} from '../src/adapters/confluence.js';
import {YandexAdapter} from '../src/adapters/yandex.js';
import {YandexWikiClient} from '../src/clients/yandex-wiki.js';
import type {AppConfig, ConfluenceConnectionProfile, NetworkLimits, YandexConnectionProfile} from '../src/config.js';
import {discoverPageGraph} from '../src/graph.js';
import {createLogger} from '../src/logger.js';
import {Migrator} from '../src/migrator.js';
import type {DestinationAdapter, DestinationPage, SourceAdapter, SourcePage} from '../src/domain.js';
import {collectMentionDecisions} from '../src/mention-export.js';
import {confluenceSpaceKey} from '../src/source-roots.js';
import {buildRetryPlan} from '../src/retry-plan.js';
import type {TransferReportData} from '../src/report-contract.js';
import {buildReportTree} from '../report-ui/src/model.js';
import type {ConfluenceApi} from '../src/types.js';
import {normalizePageContent, renderConfluenceStorage, renderStaticHtml} from '../src/content-model.js';

const limits: NetworkLimits = {readConcurrency: 4, writeConcurrency: 2, downloadConcurrency: 2, uploadConcurrency: 2, requestsPerSecond: 100, burst: 100};
const profile: ConfluenceConnectionProfile = {name: 'source', type: 'confluence', deployment: 'data-center', authType: 'pat', baseUrl: 'https://confluence.example.com/context', token: 'fixture-token', limits};
const key = '~user.name@example.com';
const locator = `${profile.baseUrl}/spaces/viewspace.action?key=${encodeURIComponent(key)}`;
const page = (id: string, parent?: string) => ({id, type: 'page', status: 'current', title: `Page ${id}`, space: {id: '7', key}, ancestors: parent ? [{id: parent}] : [], body: {storage: {value: `<p>Body ${id}</p>`, representation: 'storage'}}, version: {number: 1}});
afterEach(() => nock.cleanAll());

describe('personal source contracts', () => {
  it.each(['data-center', 'cloud'] as const)('cancels %s space listing before scheduling HTTP', async deployment => {
    const controller = new AbortController();controller.abort(new Error('Stopped'));
    const client = deployment === 'data-center' ? new DataCenterConfluenceClient(profile, 1000, limits) : new CloudConfluenceClient({...profile, deployment: 'cloud', authType: 'api-token', email: 'user@example.com'}, 1000, limits);
    await expect(client.getSpacePages({id: '7', key, name: 'Notes'}, controller.signal)).rejects.toThrow('Stopped');
  });
  it.each([401, 403, 404])('preserves source space HTTP %s without creating a replacement', async status => {
    const api = nock('https://confluence.example.com').get(`/context/rest/api/space/${encodeURIComponent(key)}`).query(true).reply(status, {message: 'Not available'});
    await expect(new DataCenterConfluenceClient(profile, 1000, limits).getSpace(key)).rejects.toMatchObject({status});
    expect(api.isDone()).toBe(true);
  });

  it('keeps Yandex personal URL, slug and page ID identity equivalent', async () => {
    const wiki: YandexConnectionProfile = {name: 'wiki', type: 'yandex-wiki', apiUrl: 'https://api.wiki.example.com/v1', webUrl: 'https://wiki.example.com', authType: 'oauth', token: 'fixture', organization: {type: 'yandex360', id: '1'}, limits};
    const body = {id: 42, slug: 'users/user.name', title: 'Notes', content: '', page_type: 'page'};
    const api = nock('https://api.wiki.example.com')
      .get('/v1/pages').query({slug: 'users/user.name', fields: 'breadcrumbs,redirect,attributes,content'}).twice().reply(200, body)
      .get('/v1/pages/42').query(true).reply(200, body);
    const adapter = new YandexAdapter(wiki, new YandexWikiClient(wiki, 1000, limits));
    const roots = await Promise.all([adapter.resolvePage(`${wiki.webUrl}/users/user.name/`), adapter.resolvePage('users/user.name'), adapter.resolvePage('42')]);
    expect(new Set(roots.map(page => page.canonicalId)).size).toBe(1);expect(api.isDone()).toBe(true);
  });
  it('reads Data Center space identity without a user lookup and paginates independent branches', async () => {
    const api = nock('https://confluence.example.com')
      .get(`/context/rest/api/space/${encodeURIComponent(key)}`).query({expand: 'homepage'}).reply(200, {id: 7, key, name: 'Personal notes', homepage: {id: '10'}})
      .get(`/context/rest/api/space/${encodeURIComponent(key)}/content/page`).query({start: 0, limit: 100, depth: 'all', expand: 'space,version,ancestors,body.storage'})
      .reply(200, {results: [page('10')], size: 1, _links: {next: '?start=1'}})
      .get(`/context/rest/api/space/${encodeURIComponent(key)}/content/page`).query({start: 1, limit: 100, depth: 'all', expand: 'space,version,ancestors,body.storage'})
      .reply(200, {results: [page('20')], size: 1});
    const client = new DataCenterConfluenceClient(profile, 1000, limits);
    expect(await client.getSpace(key)).toMatchObject({id: '7', key, homepageId: '10'});
    expect((await client.getSpacePages({id: '7', key, name: 'Personal notes'})).map(item => item.id)).toEqual(['10', '20']);
    expect(api.isDone()).toBe(true);
  });

  it('resolves the Cloud personal space and REST v2 page listing', async () => {
    const cloud: ConfluenceConnectionProfile = {...profile, deployment: 'cloud', authType: 'api-token', email: 'user@example.com', baseUrl: 'https://cloud.example.com/wiki'};
    const api = nock('https://cloud.example.com')
      .get('/wiki/api/v2/spaces').query({keys: key, limit: 2}).reply(200, {results: [{id: '7', key, name: 'Notes', homepageId: '10'}]})
      .get('/wiki/api/v2/spaces/7/pages').query({'body-format': 'storage', limit: 100}).reply(200, {results: [{id: '10', title: 'Home', spaceId: '7', status: 'current', body: {storage: {value: '', representation: 'storage'}}}]});
    const client = new CloudConfluenceClient(cloud, 1000, limits);
    const space = await client.getSpace(key);
    expect(space).toMatchObject({id: '7', homepageId: '10'});
    expect((await client.getSpacePages(space)).map(item => item.id)).toEqual(['10']);
    expect(api.isDone()).toBe(true);
  });

  it('resolves a typed space root and includes orphan branches without a fake page request', async () => {
    const client = new DataCenterConfluenceClient(profile, 1000, limits);
    nock('https://confluence.example.com')
      .get(`/context/rest/api/space/${encodeURIComponent(key)}`).query(true).reply(200, {id: 7, key, name: 'Notes', homepage: {id: '10'}})
      .get(`/context/rest/api/space/${encodeURIComponent(key)}/content/page`).query(true).reply(200, {results: [page('10'), page('11', '10'), page('20')]});
    const adapter = new ConfluenceAdapter(profile, client);
    const root = await adapter.resolveRoot(locator);
    expect(root.kind).toBe('space');
    const graph = await discoverPageGraph({adapter, root: root.item, scope: 'subtree'});
    expect(graph.pages.filter(item => !item.sourceSpace).map(item => item.id).sort()).toEqual(['10', '11', '20']);
    expect(graph.pages.find(item => item.id === '20')?.projectedParentId).toBe(root.item.canonicalId);
    expect(graph.selection).toMatchObject({returnedDescendants: 3, selectedDescendants: 3, hierarchyGaps: []});
  });

  it('retains every enumerated page when one required detail fails', async () => {
    const api = nock('https://confluence.example.com')
      .get(`/context/rest/api/space/${encodeURIComponent(key)}`).query(true).reply(200, {id: 7, key, name: 'Notes'})
      .get(`/context/rest/api/space/${encodeURIComponent(key)}/content/page`).query(true).reply(200, {results: [page('10'), {...page('20'), body: undefined}]})
      .get('/context/rest/api/content/20').query(true).reply(403, {message: 'Restricted'});
    const adapter = new ConfluenceAdapter(profile, new DataCenterConfluenceClient(profile, 1000, limits));
    const root = await adapter.resolveRoot(locator);
    await expect(discoverPageGraph({adapter, root: root.item, scope: 'subtree'})).rejects.toMatchObject({pages: expect.arrayContaining([expect.objectContaining({id: '10'}), expect.objectContaining({id: '20'})]), failures: [expect.objectContaining({page: expect.objectContaining({id: '20'}), retryable: false})]});
    expect(api.isDone()).toBe(true);
  });

  it('does not duplicate identities when checkpoint persistence fails', async () => {
    const adapter = new ConfluenceAdapter(profile, {pageWebUrl: (item: {id: string}) => `${profile.baseUrl}/pages/${item.id}`, getSpacePages: async () => [page('10'), page('20')]} as unknown as ConfluenceApi);
    await expect(adapter.getSpacePages({id: '7', key, name: 'Notes'}, {loadPage: async () => undefined, savePage: async () => {throw new Error('Checkpoint disk unavailable');}})).rejects.toMatchObject({pages: expect.any(Array), failures: expect.any(Array)});
    try {await adapter.getSpacePages({id: '7', key, name: 'Notes'}, {loadPage: async () => undefined, savePage: async () => {throw new Error('Checkpoint disk unavailable');}});} catch (error) {
      expect((error as {pages: unknown[]}).pages).toHaveLength(2);
    }
  });

  it.each(['html', 'markdown'] as const)('exports every real page with a separate %s index and exact report totals', async format => {
    const api = nock('https://confluence.example.com')
      .get('/context/rest/api/settings/systemInfo').reply(200, {version: '9.5'})
      .get(`/context/rest/api/space/${encodeURIComponent(key)}`).query(true).reply(200, {id: 7, key, name: 'Notes'})
      .get(`/context/rest/api/space/${encodeURIComponent(key)}/content/page`).query(true).reply(200, {results: [page('10'), page('20')]});
    for (const id of ['10', '20']) api.get(`/context/rest/api/content/${id}/child/attachment`).query(true).reply(200, {results: []});
    const directory = await mkdtemp(path.join(os.tmpdir(), 'ywtc-personal-'));
    const config: AppConfig = {profiles: {source: profile}, timeoutMs: 1000, concurrency: 2, configFile: path.join(directory, 'ywtc.config.yaml')};
    const result = await new Migrator(config, createLogger([])).run({source: {type: 'remote', value: locator, profile}, destination: {type: 'directory', format, path: path.join(directory, 'export')}, scope: 'subtree', comments: false, dryRun: false, archive: false, concurrency: 2, runtimeDirectory: path.join(directory, '.states'), cacheDirectory: path.join(directory, '.states/cache'), reportsDirectory: path.join(directory, '.states/reports')});
    expect(result.summary).toMatchObject({pages: 2, complete: 2, inventoryComplete: true});
    const manifest = JSON.parse(await readFile(path.join(directory, 'export/.ywtc-export.json'), 'utf8'));
    expect(manifest.pages).toHaveLength(2);
    const index = `index.${format === 'html' ? 'html' : 'md'}`;
    expect(manifest.container.path).toBe(index);
    const report = JSON.parse(await readFile(result.reportPaths.json, 'utf8')) as TransferReportData;
    expect(confluenceSpaceKey(report.invocation!.source.locator, profile.baseUrl)).toBe(key);
    expect(buildReportTree(report).roots).toEqual([report.container!.sourceCanonicalId]);
    expect(await readFile(path.join(directory, 'export', index), 'utf8')).toContain('Page 20');
    expect(api.isDone()).toBe(true);
  });

  it.each([
    [`${profile.baseUrl}/display/${encodeURIComponent(key)}`, key],
    [`${profile.baseUrl}/spaces/viewspace.action?key=${encodeURIComponent(key)}`, key],
    ['https://cloud.example.com/wiki/spaces/~user/overview', '~user'],
  ])('parses space URL %s exactly once', (url, expected) => {
    expect(confluenceSpaceKey(url, url.startsWith(profile.baseUrl) ? profile.baseUrl : 'https://cloud.example.com/wiki')).toBe(expected);
  });

  it('distinguishes page URLs and rejects unsafe space contexts', () => {
    expect(confluenceSpaceKey(`${profile.baseUrl}/display/~user/Title`, profile.baseUrl)).toBeUndefined();
    expect(confluenceSpaceKey(`${profile.baseUrl}/display/~user/overview`, profile.baseUrl)).toBeUndefined();
    expect(() => confluenceSpaceKey('https://other.example.com/spaces/viewspace.action?key=~user', profile.baseUrl)).toThrow(/host/);
    expect(() => confluenceSpaceKey(`${profile.baseUrl}/spaces/viewspace.action?key=x&key=y`, profile.baseUrl)).toThrow(/exactly one/);
  });
});

function fixture() {
  const capabilities = {readPages: true, readHierarchy: true, readResources: true, writePages: true, writeResources: true, verifyWrites: true, readComments: true, writeComments: true, reparentPages: true};
  const root: SourcePage = {provider: 'confluence', profile: 'source', id: 'space:7', canonicalId: 'source:confluence:space:7', title: 'Notes', locator, url: locator, rawContent: '', rawFormat: 'confluence-storage', references: [], space: '7', sourceSpace: {id: '7', key, name: 'Notes', homepageId: '10'}};
  const pages: SourcePage[] = ['10', '20'].map(id => ({provider: 'confluence', profile: 'source', id, canonicalId: `source:confluence:${id}`, title: `Page ${id}`, locator: id, url: `${profile.baseUrl}/pages/${id}`, rawContent: `<p>Hello <ac:link><ri:user ri:username="user"/></ac:link></p>`, rawFormat: 'confluence-storage', references: [], sourceStatus: 'current', space: key}));
  const source = {kind: 'confluence', profile, capabilities,
    preflight: async () => ({product: 'Confluence', warnings: []}),
    resolveRoot: async () => ({kind: 'space', item: root}), resolvePage: async () => {throw new Error('Unexpected real page resolution');},
    getPage: async (id: string) => {const page = pages.find(item => item.id === id);if (!page) throw new Error('Not a real page');return page;},
    getSpacePages: async () => pages, getDescendants: async () => [], supportsSourceStatus: () => true, resolveReference: async () => undefined,
    listResources: vi.fn(async (page: SourcePage) => {if (page.sourceSpace) throw new Error('Container has no source resources');return [];}),
    readComments: vi.fn(async (page: SourcePage) => {if (page.sourceSpace) throw new Error('Container has no comments');return {status: 'empty', threads: [], comments: 0, participants: 0, attachments: 0, knownBytes: 0, unknownSizes: 0, warnings: []};}),
  } as unknown as SourceAdapter & DestinationAdapter;
  const destProfile: ConfluenceConnectionProfile = {...profile, name: 'dest', baseUrl: 'https://destination.example.com'};
  const container = {provider: 'confluence' as const, profile: 'dest', id: '100', canonicalId: 'dest:confluence:100', title: 'Archive', url: `${destProfile.baseUrl}/pages/100`, space: 'DOC'};
  const stored = new Map<string, DestinationPage>();
  const destination = {kind: 'confluence', profile: destProfile, capabilities,
    preflight: async () => ({product: 'Confluence', warnings: []}), resolveContainer: async () => container,
    findChild: async () => undefined, listUploadedResources: async () => [],
    createPage: vi.fn(async ({title, body, container: parent}: {title: string; body: string; container: typeof container}) => {
      const id = String(200 + stored.size);
      const page: DestinationPage = {provider: 'confluence', profile: 'dest', id, canonicalId: `dest:confluence:${id}`, title, url: `${destProfile.baseUrl}/pages/${id}`, parentId: parent.id, space: 'DOC', content: body, version: '1'};
      stored.set(id, page);return page;
    }),
    updatePage: vi.fn(async ({page, title, body}: {page: DestinationPage; title: string; body: string}) => {const next = {...page, title, content: body, version: String(Number(page.version ?? 0) + 1)};stored.set(page.id, next);return next;}),
    verifyPage: async (page: DestinationPage) => {const existing = stored.get(page.id);if (!existing) throw new Error('Missing page');return existing;},
  } as unknown as SourceAdapter & DestinationAdapter;
  return {root, pages, source, destination, stored, destProfile};
}

describe('personal space transfer lifecycle', () => {
  it('keeps explicit mention URLs literal while rewriting identical space navigation', async () => {
    const f = fixture();
    const page = {...f.pages[0]!, rawContent: `<p><a href="${f.root.url}">Navigation</a> <ac:link><ri:user ri:username="user"/></ac:link></p>`};
    const document = normalizePageContent(page);
    const body = await renderConfluenceStorage(document, page, {currentPageId: page.canonicalId, resources: new Map(), sourcePages: new Map([f.root, page].map(item => [item.canonicalId, item])), pages: new Map([[f.root.canonicalId, {provider: 'confluence', profile: 'dest', id: '200', canonicalId: 'dest:200', title: 'Notes', url: 'https://destination.example.com/pages/200'}]]), mentions: new Map(document.mentions!.map(mention => [mention.id, {outcome: 'linked', label: '@user', url: f.root.url, retryable: false}]))}, 'DOC');
    expect(body.body).toContain('href="https://destination.example.com/pages/200">Navigation</a>');
    expect(body.body).toContain(`href="${f.root.url.replaceAll('&', '&amp;')}">@user</a>`);
  });
  it('selects 115 real pages across independent branches and rejects duplicate IDs', async () => {
    const f = fixture();const template = f.pages[0]!;f.pages.splice(0);
    for (let index = 0; index < 115; index += 1) f.pages.push({...template, id: String(1000 + index), canonicalId: `source:confluence:${1000 + index}`, ...(index % 5 ? {parentId: String(1000 + index - 1)} : {})});
    const graph = await discoverPageGraph({adapter: f.source, root: f.root, scope: 'subtree'});
    expect(graph.selection).toMatchObject({selectedDescendants: 115, returnedDescendants: 115, maximumDepth: 5});
    f.pages.push(f.pages[0]!);await expect(discoverPageGraph({adapter: f.source, root: f.root, scope: 'subtree'})).rejects.toThrow(/duplicate/);
  });
  it.each(['html', 'markdown'] as const)('exports an empty space to %s without inventing source objects', async format => {
    const f = fixture();f.pages.splice(0);delete f.root.sourceSpace!.homepageId;
    const directory = await mkdtemp(path.join(os.tmpdir(), 'ywtc-space-empty-'));
    const config: AppConfig = {profiles: {source: profile}, timeoutMs: 1000, concurrency: 2, configFile: path.join(directory, 'ywtc.config.yaml')};
    const result = await new Migrator(config, createLogger([]), () => f.source).run({source: {type: 'remote', value: locator, profile}, destination: {type: 'directory', path: path.join(directory, 'export'), format}, scope: 'subtree', comments: true, dryRun: false, archive: false, concurrency: 2, runtimeDirectory: path.join(directory, '.states'), cacheDirectory: path.join(directory, '.states/cache'), reportsDirectory: path.join(directory, '.states/reports')});
    expect(result.status).toBe('completed');expect(result.summary).toMatchObject({pages: 0, resources: 0, comments: 0, inventoryComplete: true});
    expect(await readFile(path.join(directory, `export/index.${format === 'html' ? 'html' : 'md'}`), 'utf8')).toContain('Notes');
    expect(f.source.listResources).not.toHaveBeenCalled();expect(f.source.readComments).not.toHaveBeenCalled();
  });
  it('rewrites space entry URLs to the generated section in remote and portable rendering', async () => {
    const f = fixture();const page = {...f.pages[0]!, rawContent: `<p><a href="${locator}">Notes</a></p>`};
    const context = {currentPageId: page.canonicalId, resources: new Map(), sourcePages: new Map([f.root, page].map(item => [item.canonicalId, item])), pages: new Map([[f.root.canonicalId, {provider: 'confluence' as const, profile: 'dest', id: '200', canonicalId: 'dest:confluence:200', title: 'Notes', url: 'https://destination.example.com/pages/200'}]])};
    expect((await renderConfluenceStorage(normalizePageContent(page), page, context, 'DOC')).body).toContain('https://destination.example.com/pages/200');
    const portable = {...context, currentPath: 'pages/10.html', pages: new Map([[f.root.canonicalId, {path: 'index.html', title: 'Notes'}]])};
    expect((await renderStaticHtml(normalizePageContent(page), portable)).body).toContain('../index.html');
  });

  it('rejects a cyclic parent graph and missing status before writes', async () => {
    const f = fixture();f.pages[0]!.parentId = '20';f.pages[1]!.parentId = '10';
    await expect(discoverPageGraph({adapter: f.source, root: f.root, scope: 'subtree'})).rejects.toThrow(/cycle/);
    delete f.pages[0]!.parentId;delete f.pages[1]!.parentId;delete f.pages[1]!.sourceStatus;
    await expect(discoverPageGraph({adapter: f.source, root: f.root, scope: 'subtree', sourceStatus: 'current'})).rejects.toThrow(/status/);
  });

  it('retains a known selected ancestor across an unavailable intermediate parent', async () => {
    const f = fixture();f.pages[1]!.parentId = 'missing';f.pages[1]!.ancestorIds = ['10', 'missing'];
    const graph = await discoverPageGraph({adapter: f.source, root: f.root, scope: 'subtree'});
    expect(graph.pages.find(page => page.id === '20')?.projectedParentId).toBe('source:confluence:10');
    expect(graph.selection.hierarchyGaps).toHaveLength(1);
  });
  it('resumes real pages and a separate container after homepage changes without duplicates', async () => {
    const f = fixture();const directory = await mkdtemp(path.join(os.tmpdir(), 'ywtc-space-live-'));
    const config: AppConfig = {profiles: {source: profile, dest: f.destProfile}, timeoutMs: 1000, concurrency: 2, configFile: path.join(directory, 'ywtc.config.yaml')};
    const options = {source: {type: 'remote' as const, value: locator, profile}, destination: {type: 'remote' as const, value: '100', profile: f.destProfile}, scope: 'subtree' as const, comments: true, dryRun: false, archive: false, concurrency: 2, runtimeDirectory: path.join(directory, '.states'), cacheDirectory: path.join(directory, '.states/cache'), reportsDirectory: path.join(directory, '.states/reports')};
    const migrator = new Migrator(config, createLogger([]), selected => selected.name === 'source' ? f.source : f.destination);
    const first = await migrator.run(options);
    expect(first.summary).toMatchObject({pages: 2, complete: 2, errors: 0, inventoryFreshPages: 2});
    expect(f.stored.size).toBe(3);
    expect([...f.stored.values()].filter(page => page.parentId === '200')).toHaveLength(2);
    f.root.sourceSpace!.homepageId = '20';
    const second = await migrator.run(options);
    expect(second.stateId).toBe(first.stateId);expect(f.stored.size).toBe(3);
    const state = JSON.parse(await readFile(second.stateFilename, 'utf8'));
    expect(Object.keys(state.pages)).toHaveLength(2);expect(state.container.destinationId).toBe('200');
    expect(f.source.listResources).toHaveBeenCalledTimes(4);expect(f.source.readComments).toHaveBeenCalledTimes(4);
  });

  it('scans space mentions without source resources or container occurrences', async () => {
    const f = fixture();
    const decisions = await collectMentionDecisions({adapter: f.source, locator, scope: 'subtree', sourceStatus: 'all', comments: true, concurrency: 2});
    expect(decisions.inventory).toMatchObject({complete: true, selectedPages: 2, scannedPages: 2});
    expect(decisions.entries).toHaveLength(1);expect(decisions.entries[0]!.occurrences).toHaveLength(2);
    expect(f.source.listResources).not.toHaveBeenCalled();expect(f.source.readComments).toHaveBeenCalledTimes(2);
  });

  it('retries a failed section and its blocked pages without treating the section as a real page', async () => {
    const f = fixture();const directory = await mkdtemp(path.join(os.tmpdir(), 'ywtc-space-retry-'));
    const config: AppConfig = {profiles: {source: profile, dest: f.destProfile}, timeoutMs: 1000, concurrency: 2, configFile: path.join(directory, 'ywtc.config.yaml')};
    const options = {source: {type: 'remote' as const, value: locator, profile}, destination: {type: 'remote' as const, value: '100', profile: f.destProfile}, scope: 'subtree' as const, comments: true, dryRun: false, archive: false, concurrency: 2, runtimeDirectory: path.join(directory, '.states'), cacheDirectory: path.join(directory, '.states/cache'), reportsDirectory: path.join(directory, '.states/reports')};
    vi.mocked(f.destination.createPage).mockRejectedValueOnce(new Error('Temporary provider failure'));
    const migrator = new Migrator(config, createLogger([]), selected => selected.name === 'source' ? f.source : f.destination);
    const failed = await migrator.run(options);
    const baseline = JSON.parse(await readFile(failed.reportPaths.json, 'utf8')) as TransferReportData;
    expect(baseline.summary).toMatchObject({pages: 2, blocked: 2, errors: 1});
    const plan = buildRetryPlan(baseline);
    expect(plan.retryPageIds).toHaveLength(2);expect(plan.remainingTerminal).toBe(0);
    const retried = await migrator.run({...options, retry: {rootRunId: baseline.runId, parentRunId: baseline.runId, attempt: 1, baseline, plan}});
    expect(retried.summary).toMatchObject({pages: 2, complete: 2, errors: 0});
    expect(f.stored.size).toBe(3);
  });

  it('requires a homepage only for page and linked and permits empty subtree', async () => {
    const f = fixture();delete f.root.sourceSpace!.homepageId;f.pages.splice(0);
    await expect(discoverPageGraph({adapter: f.source, root: f.root, scope: 'page'})).rejects.toThrow(/homepage/);
    await expect(discoverPageGraph({adapter: f.source, root: f.root, scope: 'linked'})).rejects.toThrow(/homepage/);
    const graph = await discoverPageGraph({adapter: f.source, root: f.root, scope: 'subtree'});
    expect(graph.selection.selectedDescendants).toBe(0);expect(graph.pages).toHaveLength(1);
  });

  it('uses homepage only for page scope and reports status exclusions for space subtree', async () => {
    const f = fixture();
    expect((await discoverPageGraph({adapter: f.source, root: f.root, scope: 'page'})).pages.map(page => page.id)).toEqual(['space:7', '10']);
    f.pages[1]!.sourceStatus = 'non-current';
    const graph = await discoverPageGraph({adapter: f.source, root: f.root, scope: 'subtree', sourceStatus: 'current'});
    expect(graph.selection.excluded.map(page => page.id)).toEqual(['20']);
  });
});

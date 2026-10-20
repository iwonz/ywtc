import {describe, expect, it} from 'vitest';
import {ConfluenceAdapter} from '../src/adapters/confluence.js';
import {YandexAdapter} from '../src/adapters/yandex.js';
import type {YandexWikiClient} from '../src/clients/yandex-wiki.js';
import type {ConfluenceConnectionProfile, NetworkLimits, YandexConnectionProfile} from '../src/config.js';
import {DestinationRevisionConflictError, DestinationTitleConflictError, IncompleteSourceDiscoveryError} from '../src/domain.js';
import {HttpRequestError} from '../src/http.js';
import type {ConfluenceApi, ConfluencePage, YandexPageDetails} from '../src/types.js';

const limits: NetworkLimits = {readConcurrency: 4, writeConcurrency: 2, downloadConcurrency: 2, uploadConcurrency: 2, requestsPerSecond: 8, burst: 8};
const yandexProfile: YandexConnectionProfile = {
  name: 'wiki', type: 'yandex-wiki', apiUrl: 'https://api.wiki.example/v1', webUrl: 'https://wiki.example',
  authType: 'oauth', organization: {type: 'yandex360', id: 'org'}, token: 'token', limits,
};
const confluenceProfile: ConfluenceConnectionProfile = {
  name: 'conf', type: 'confluence', deployment: 'data-center', baseUrl: 'https://conf.example/confluence',
  authType: 'pat', token: 'token', limits,
};

describe('source page content contracts', () => {
  it('distinguishes explicit empty Yandex content from a missing content field', async () => {
    const base = {id: 1, slug: 'root', title: 'Root', page_type: 'page'} satisfies YandexPageDetails;
    const missingClient = {getPageBySlug: async () => base} as unknown as YandexWikiClient;
    await expect(new YandexAdapter(yandexProfile, missingClient).resolvePage('root')).rejects.toThrow(/missing content/);
    const emptyClient = {getPageBySlug: async () => ({...base, content: ''})} as unknown as YandexWikiClient;
    await expect(new YandexAdapter(yandexProfile, emptyClient).resolvePage('root')).resolves.toMatchObject({rawContent: ''});
  });

  it('marks null Yandex Grid content as provider-unavailable without accepting null ordinary pages', async () => {
    const gridClient = {
      getPageBySlug: async () => ({id: 2, slug: 'root/grid', title: 'Grid', page_type: 'grid', content: null}),
    } as unknown as YandexWikiClient;
    await expect(new YandexAdapter(yandexProfile, gridClient).resolvePage('root/grid')).resolves.toMatchObject({
      rawContent: '',
      contentAvailability: {status: 'provider-unavailable', sourceType: 'grid', reason: 'provider-null-body'},
    });

    const ordinaryClient = {
      getPageBySlug: async () => ({id: 3, slug: 'root/page', title: 'Page', page_type: 'page', content: null}),
    } as unknown as YandexWikiClient;
    await expect(new YandexAdapter(yandexProfile, ordinaryClient).resolvePage('root/page')).rejects.toThrow(/missing content/);
  });

  it('uses the Yandex download URL basename as the preferred resource name', async () => {
    const client = {
      getAttachments: async () => [{
        id: 7, name: 'image.png', is_downloadable: true,
        download_url: 'https://wiki.example/root/.files/image-3.png', size: '127.34', has_preview: true,
      }],
      getPageGrids: async () => [],
    } as unknown as YandexWikiClient;
    const adapter = new YandexAdapter(yandexProfile, client);
    const resources = await adapter.listResources({
      provider: 'yandex-wiki', profile: 'wiki', id: '1', canonicalId: 'wiki:1', title: 'Root',
      locator: 'root', url: 'https://wiki.example/root', rawContent: '', rawFormat: 'yfm', references: [],
    });
    expect(resources[0]).toMatchObject({name: 'image.png', preferredName: 'image-3.png'});
    expect(resources[0]?.size).toBeUndefined();
    expect(resources[0]?.referenceAliases).toContain('/root/.files/image-3.png');
  });

  it('uses explicit attachment size units while leaving ambiguous decimal metadata unknown', async () => {
    const client = {
      getAttachments: async () => [
        {id: 7, name: 'unknown.apk', is_downloadable: true, download_url: '/unknown.apk', size: '58.16'},
        {id: 8, name: 'known.bin', is_downloadable: true, download_url: '/known.bin', size: '1.5 MiB'},
        {id: 9, name: 'bytes.bin', is_downloadable: true, download_url: '/bytes.bin', size: '2048'},
      ],
      getPageGrids: async () => [],
    } as unknown as YandexWikiClient;
    const resources = await new YandexAdapter(yandexProfile, client).listResources({
      provider: 'yandex-wiki', profile: 'wiki', id: '1', canonicalId: 'wiki:1', title: 'Root',
      locator: 'root', url: 'https://wiki.example/root', rawContent: '', rawFormat: 'yfm', references: [],
    });
    expect(resources.map((resource) => resource.size)).toEqual([undefined, 1_572_864, 2_048]);
  });

  it('selects all Yandex descendants by default and reports current-only exclusions', async () => {
    const calls: Array<'all' | 'actual'> = [];
    const details = new Map<number, YandexPageDetails>([
      [2, {id: 2, slug: 'root/current', title: 'Current', page_type: 'page', content: 'current', breadcrumbs: [{id: 1, slug: 'root', title: 'Root'}]}],
      [3, {id: 3, slug: 'root/obsolete', title: 'Obsolete', page_type: 'page', content: 'obsolete', breadcrumbs: [{id: 1, slug: 'root', title: 'Root'}]}],
    ]);
    const client = {
      getDescendants: async (_id: number, options?: {actuality?: 'actual'}) => {
        calls.push(options?.actuality ? 'actual' : 'all');
        return options?.actuality ? [{id: 2, slug: 'root/current'}] : [{id: 2, slug: 'root/current'}, {id: 3, slug: 'root/obsolete'}];
      },
      getPageById: async (id: number) => details.get(id)!,
    } as unknown as YandexWikiClient;
    const adapter = new YandexAdapter(yandexProfile, client);
    const sourceRoot = {provider: 'yandex-wiki' as const, profile: 'wiki', id: '1', canonicalId: 'wiki:1', title: 'Root', locator: 'root', url: 'https://wiki.example/root', rawContent: '', rawFormat: 'yfm' as const, references: []};
    await expect(adapter.getDescendants(sourceRoot, {status: 'all'})).resolves.toMatchObject({returned: 2, pages: [{id: '2'}, {id: '3'}], excluded: []});
    expect(calls).toEqual(['all']);
    calls.length = 0;
    await expect(adapter.getDescendants(sourceRoot, {status: 'current'})).resolves.toMatchObject({
      returned: 2,
      pages: [{id: '2', sourceStatus: 'current'}],
      excluded: [{id: '3', locator: 'root/obsolete', reason: 'source-status', status: 'obsolete'}],
    });
    expect(calls).toEqual(['all', 'actual']);
  });

  it('preserves structured evidence when selected Yandex details cannot be loaded', async () => {
    const client = {
      getDescendants: async () => [
        {id: 2, slug: 'root/child'},
        {id: 3, slug: 'root/missing'},
        {id: 4, slug: 'root/transient'},
      ],
      getPageById: async (id: number) => {
        if (id === 3) return {id, slug: 'root/missing', title: 'Missing', page_type: 'page'};
        if (id === 4) throw new HttpRequestError('provider unavailable', 503, 'GET');
        return {id, slug: 'root/child', title: 'Child', page_type: 'page', content: 'body', breadcrumbs: [{id: 1, slug: 'root', title: 'Root'}]};
      },
    } as unknown as YandexWikiClient;
    const adapter = new YandexAdapter(yandexProfile, client);
    const sourceRoot = {provider: 'yandex-wiki' as const, profile: 'wiki', id: '1', canonicalId: 'wiki:1', title: 'Root', locator: 'root', url: 'https://wiki.example/root', rawContent: '', rawFormat: 'yfm' as const, references: []};
    const error = await adapter.getDescendants(sourceRoot, {status: 'all'}).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(IncompleteSourceDiscoveryError);
    expect(error).toMatchObject({
      message: 'Yandex Wiki descendant inventory is incomplete: 2 of 3 selected page detail request(s) failed',
      selection: {returnedDescendants: 3, selectedDescendants: 3, maximumDepth: 1},
      pages: expect.arrayContaining([
        expect.objectContaining({id: '1', depth: 0}),
        expect.objectContaining({id: '2', depth: 1}),
        expect.objectContaining({id: '3', depth: 1}),
        expect.objectContaining({id: '4', depth: 1}),
      ]),
      failures: expect.arrayContaining([
        expect.objectContaining({code: 'source-page-detail-invalid', retryable: false, page: expect.objectContaining({id: '3'})}),
        expect.objectContaining({code: 'network-source-page-detail', retryable: true, page: expect.objectContaining({id: '4'})}),
      ]),
    });
    expect(String(error)).not.toContain('root/missing');
  });

  it('keeps renamed pages by immutable ID and excludes pages moved outside the selected subtree', async () => {
    const client = {
      getDescendants: async () => [
        {id: 2, slug: 'root/old-name'},
        {id: 3, slug: 'root/moved-away'},
      ],
      getPageById: async (id: number) => id === 2
        ? {id, slug: 'root/new-name', title: 'Renamed', page_type: 'page', content: 'body', breadcrumbs: [{id: 1, slug: 'root', title: 'Root'}]}
        : {id, slug: 'other/moved-away', title: 'Moved', page_type: 'page', content: 'body', breadcrumbs: [{id: 99, slug: 'other', title: 'Other'}]},
    } as unknown as YandexWikiClient;
    const adapter = new YandexAdapter(yandexProfile, client);
    const sourceRoot = {provider: 'yandex-wiki' as const, profile: 'wiki', id: '1', canonicalId: 'wiki:1', title: 'Root', locator: 'root', url: 'https://wiki.example/root', rawContent: '', rawFormat: 'yfm' as const, references: []};
    const result = await adapter.getDescendants(sourceRoot, {status: 'all'});
    expect(result.pages).toEqual([expect.objectContaining({id: '2', locator: 'root/new-name'})]);
    expect(result.excluded).toEqual([expect.objectContaining({id: '3', locator: 'other/moved-away', reason: 'inventory-drift'})]);
    expect(result.notes.join(' ')).toMatch(/changed locator/);
    expect(result.notes.join(' ')).toMatch(/moved outside/);
  });

  it('classifies Yandex title collisions and update revision races without message heuristics', async () => {
    const existing = {id: 2, slug: 'root/child', title: 'Child', page_type: 'page' as const, content: 'existing', breadcrumbs: [{id: 1, slug: 'root', title: 'Root'}]};
    const client = {
      createPage: async () => { throw new HttpRequestError('provider collision', 409, 'POST'); },
      getPageBySlug: async () => existing,
      updatePage: async () => { throw new HttpRequestError('provider revision state', 409, 'POST'); },
    } as unknown as YandexWikiClient;
    const adapter = new YandexAdapter(yandexProfile, client);
    const parent = {provider: 'yandex-wiki' as const, profile: 'wiki', id: '1', canonicalId: 'wiki:1', title: 'Root', locator: 'root', url: 'https://wiki.example/root'};
    await expect(adapter.createPage({container: parent, title: 'Child', body: 'body'})).rejects.toBeInstanceOf(DestinationTitleConflictError);
    await expect(adapter.updatePage({
      page: {provider: 'yandex-wiki', profile: 'wiki', id: '2', canonicalId: 'wiki:2', title: 'Child', locator: 'root/child', url: 'https://wiki.example/root/child'},
      title: 'Child', body: 'updated',
    })).rejects.toBeInstanceOf(DestinationRevisionConflictError);
  });

  it('requires Confluence Storage Format while allowing an explicitly empty body', async () => {
    const base: ConfluencePage = {id: '1', type: 'page', title: 'Root', space: {key: 'DOC'}};
    const missingClient = {
      resolveTarget: async () => base,
      pageWebUrl: () => 'https://conf.example/confluence/pages/1',
    } as unknown as ConfluenceApi;
    await expect(new ConfluenceAdapter(confluenceProfile, missingClient).resolvePage('1')).rejects.toThrow(/missing body\.storage\.value/);
    const emptyClient = {
      resolveTarget: async () => ({...base, body: {storage: {value: '', representation: 'storage'}}}),
      pageWebUrl: () => 'https://conf.example/confluence/pages/1',
    } as unknown as ConfluenceApi;
    await expect(new ConfluenceAdapter(confluenceProfile, emptyClient).resolvePage('1')).resolves.toMatchObject({rawContent: ''});
  });

  it('recovers a Confluence page by title only under the expected parent', async () => {
    let parentId = 'other-parent';
    const candidate = (): ConfluencePage => ({
      id: '2', type: 'page', title: 'Child', space: {key: 'DOC'}, ancestors: [{id: parentId}],
      body: {storage: {value: '<p>Body</p>', representation: 'storage'}},
    });
    const client = {
      findPageByTitle: async () => candidate(),
      getPage: async () => candidate(),
      pageWebUrl: () => 'https://conf.example/confluence/pages/2',
    } as unknown as ConfluenceApi;
    const adapter = new ConfluenceAdapter(confluenceProfile, client);
    const expectedParent = {
      provider: 'confluence' as const, profile: 'conf', id: '100', canonicalId: 'conf:100',
      title: 'Parent', url: 'https://conf.example/confluence/pages/100', space: 'DOC',
    };
    await expect(adapter.findTitleConflict!(expectedParent, 'Child')).resolves.toMatchObject({id: '2', parentId: 'other-parent'});
    await expect(adapter.findRecoverablePage(expectedParent, 'Child')).resolves.toBeUndefined();
    parentId = expectedParent.id;
    await expect(adapter.findChild(expectedParent, 'Child')).resolves.toMatchObject({id: '2', parentId: '100'});
    await expect(adapter.findRecoverablePage(expectedParent, 'Child')).resolves.toMatchObject({id: '2', parentId: '100'});
  });

  it('prefers parent-scoped Confluence recovery lookup when available', async () => {
    const candidate: ConfluencePage = {
      id: '2', type: 'page', title: 'Child', space: {key: 'DOC'}, ancestors: [{id: '100'}],
      body: {storage: {value: '<p>Body</p>', representation: 'storage'}},
    };
    const client = {
      findChildPage: async () => candidate,
      findPageByTitle: async () => { throw new Error('space lookup must not be used'); },
      getPage: async () => candidate,
      pageWebUrl: () => 'https://conf.example/confluence/pages/2',
    } as unknown as ConfluenceApi;
    const adapter = new ConfluenceAdapter(confluenceProfile, client);
    const expectedParent = {
      provider: 'confluence' as const, profile: 'conf', id: '100', canonicalId: 'conf:100',
      title: 'Parent', url: 'https://conf.example/confluence/pages/100', space: 'DOC',
    };
    await expect(adapter.findRecoverablePage(expectedParent, 'Child')).resolves.toMatchObject({id: '2', parentId: '100'});
  });

  it.each(['data-center', 'cloud'] as const)('classifies authoritative %s duplicate-title creates without masking ordinary bad requests', async (deployment) => {
    let duplicate = true;
    const duplicateStatus = deployment === 'cloud' ? 409 : 400;
    const client = {
      createPage: async () => {
        throw duplicate
          ? new HttpRequestError(`HTTP request failed: status=${duplicateStatus}: Cannot create a page with this title because another page with the same title already exists`, duplicateStatus, 'POST')
          : new HttpRequestError('HTTP request failed: status=400: malformed storage body', 400, 'POST');
      },
      findPageByTitle: async () => undefined,
      pageWebUrl: () => 'https://conf.example/confluence/pages/2',
    } as unknown as ConfluenceApi;
    const profile: ConfluenceConnectionProfile = deployment === 'data-center'
      ? confluenceProfile
      : {...confluenceProfile, deployment: 'cloud', baseUrl: 'https://example.atlassian.net/wiki', authType: 'api-token', email: 'user@example.com'};
    const adapter = new ConfluenceAdapter(profile, client);
    const expectedParent = {
      provider: 'confluence' as const, profile: profile.name, id: '100', canonicalId: 'conf:100',
      title: 'Parent', url: `${profile.baseUrl}/pages/100`, space: 'DOC',
    };
    await expect(adapter.createPage({container: expectedParent, title: 'Child', body: '<p>Body</p>'})).rejects.toBeInstanceOf(DestinationTitleConflictError);
    duplicate = false;
    await expect(adapter.createPage({container: expectedParent, title: 'Child', body: '<p>Body</p>'})).rejects.toBeInstanceOf(HttpRequestError);
  });

  it('filters Confluence current descendants and reparents through the shared adapter', async () => {
    const pages: ConfluencePage[] = [
      {id: '2', type: 'page', status: 'current', title: 'Current', space: {key: 'DOC'}, ancestors: [{id: '1'}], body: {storage: {value: '<p>Current</p>', representation: 'storage'}}},
      {id: '3', type: 'page', status: 'archived', title: 'Archived', space: {key: 'DOC'}, ancestors: [{id: '1'}], body: {storage: {value: '<p>Archived</p>', representation: 'storage'}}},
    ];
    let updatedParent: string | undefined;
    const client = {
      getDescendants: async () => pages,
      updatePage: async (input: {pageId: string; title: string; storage: string; parentId?: string}) => {
        updatedParent = input.parentId;
        return {...pages[0]!, ancestors: input.parentId ? [{id: input.parentId}] : []};
      },
      getPage: async () => ({...pages[0]!, ancestors: updatedParent ? [{id: updatedParent}] : []}),
      pageWebUrl: (page: ConfluencePage) => `https://conf.example/confluence/pages/${page.id}`,
    } as unknown as ConfluenceApi;
    const adapter = new ConfluenceAdapter(confluenceProfile, client);
    const sourceRoot = {provider: 'confluence' as const, profile: 'conf', id: '1', canonicalId: 'conf:1', title: 'Root', locator: '1', url: 'https://conf.example/confluence/pages/1', rawContent: '', rawFormat: 'confluence-storage' as const, references: []};
    await expect(adapter.getDescendants(sourceRoot, {status: 'current'})).resolves.toMatchObject({
      returned: 2, pages: [{id: '2'}], excluded: [{id: '3', reason: 'source-status'}],
    });
    const moved = await adapter.reparentPage!({
      page: {provider: 'confluence', profile: 'conf', id: '2', canonicalId: 'conf:2', title: 'Current', url: 'https://conf.example/confluence/pages/2', content: '<p>Current</p>', parentId: '1'},
      parent: {provider: 'confluence', profile: 'conf', id: '9', canonicalId: 'conf:9', title: 'Parent', url: 'https://conf.example/confluence/pages/9', space: 'DOC'},
    });
    expect(updatedParent).toBe('9');
    expect(moved.parentId).toBe('9');
  });

  it('passes the confirmed page version and classifies optimistic revision conflicts', async () => {
    let submittedVersion: number | undefined;
    let conflict = false;
    const page: ConfluencePage = {
      id: '2', type: 'page', status: 'current', title: 'Current', space: {key: 'DOC'}, version: {number: 7},
      ancestors: [{id: '1'}], body: {storage: {value: '<p>Current</p>', representation: 'storage'}},
    };
    const client = {
      updatePage: async (input: {version?: number}) => {
        submittedVersion = input.version;
        if (conflict) throw new HttpRequestError('HTTP request failed: status=409: stale version', 409, 'PUT');
        return {...page, version: {number: 8}};
      },
      pageWebUrl: () => 'https://conf.example/confluence/pages/2',
    } as unknown as ConfluenceApi;
    const adapter = new ConfluenceAdapter(confluenceProfile, client);
    const mapped = {
      provider: 'confluence' as const, profile: 'conf', id: '2', canonicalId: 'conf:2', title: 'Current',
      url: 'https://conf.example/confluence/pages/2', content: '<p>Current</p>', version: '7', parentId: '1',
    };
    await expect(adapter.updatePage({page: mapped, title: 'Current', body: '<p>Source</p>'})).resolves.toMatchObject({version: '8'});
    expect(submittedVersion).toBe(7);
    conflict = true;
    await expect(adapter.updatePage({page: mapped, title: 'Current', body: '<p>Source</p>'})).rejects.toBeInstanceOf(DestinationRevisionConflictError);
  });
});

import {mkdtemp} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it, vi} from 'vitest';
import {normalizeCommentForest} from '../src/comments.js';
import {parseWorkspaceConfig} from '../src/config.js';
import type {SourceAdapter} from '../src/domain.js';

describe('shared decisions analysis and revisions', () => {
  it('scans both catalogs with one page/comment traversal and no resources', async () => {
    const {collectDecisionCatalogs} = await import('../src/decision-workspace.js');
    const config = parseWorkspaceConfig({connections: {wiki: {type: 'yandex-wiki', webUrl: 'https://wiki.example.com', apiUrl: 'https://api.example.com', organization: {id: '1'}}}}, '/tmp/ywtc.config.yaml');
    const resolvePage = vi.fn(async () => ({id: '1', canonicalId: 'wiki:1', provider: 'yandex-wiki', profile: 'wiki', title: 'Page', locator: 'a', url: 'https://wiki.example.com/a', rawContent: 'Hello @ivan #Tag #tag', rawFormat: 'yfm', references: []}));
    const readComments = vi.fn(async () => normalizeCommentForest([{id: 'c', author: {providerId: 'u'}, body: '@ivan #Tag'}], 'yfm'));
    const adapter = {kind: 'yandex-wiki', profile: config.profiles.wiki!, preflight: async () => ({}), resolvePage, readComments, supportsSourceStatus: () => true, listResources: () => {throw Error('Forbidden resource call');}} as unknown as SourceAdapter;
    const result = await collectDecisionCatalogs({adapter, locator: 'a', scope: 'page', sourceStatus: 'all', comments: true, concurrency: 1, kinds: ['mentions', 'hashtags']});
    expect(result.mentions?.entries).toMatchObject([{identity: {username: 'ivan'}, decision: 'skip'}]);
    expect(result.hashtags?.entries.map(entry => entry.tag).sort()).toEqual(['#Tag', '#tag']);
    expect(resolvePage).toHaveBeenCalledTimes(1);expect(readComments).toHaveBeenCalledTimes(1);
  });
  it('keeps drafts separate, rejects stale saves and never replaces published revisions', async () => {
    const {DecisionWorkspace} = await import('../src/decision-workspace.js');
    const store = new DecisionWorkspace(await mkdtemp(path.join(os.tmpdir(), 'ywtc-decisions-')));
    const document = {source: {provider: 'yandex-wiki', instance: 'https://wiki.example.com'}, entries: [{tag: '#Tag', decision: 'skip'}]};
    const first = await store.save('hashtags', document);
    const changed = {...document, entries: [{tag: '#Tag', decision: 'text', text: 'Changed'}]};
    await expect(store.save('hashtags', changed, first.id, 'wrong-revision')).rejects.toThrow(/revision/);
    const saved = await store.save('hashtags', changed, first.id, first.revision);
    const published = await store.publish(saved.id, saved.revision);
    expect(published.published).toBe(true);
    await expect(store.save('hashtags', document, published.id, published.revision)).rejects.toThrow(/immutable/);
    expect((await store.get(first.id)).document.entries[0]).toMatchObject({decision: 'text'});
  });
});

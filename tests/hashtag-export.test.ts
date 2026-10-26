import {mkdtemp, readFile, stat} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it, vi} from 'vitest';
import {normalizeCommentForest} from '../src/comments.js';
import {parseWorkspaceConfig} from '../src/config.js';
import type {SourceAdapter, SourcePage} from '../src/domain.js';
import {collectHashtagDecisions, writeHashtagBundle} from '../src/hashtag-export.js';

function fixture() {
  const config = parseWorkspaceConfig({hashtags: {mode: 'mapping', mappingFile: './absent.json'}, connections: {wiki: {type: 'yandex-wiki', webUrl: 'https://wiki.example.com', apiUrl: 'https://api.example.com', organization: {id: '1'}}}}, '/tmp/ywtc.config.yaml');
  const page: SourcePage = {id: '1', canonicalId: 'wiki:1', provider: 'yandex-wiki', profile: 'wiki', title: 'Page', locator: 'a', url: 'https://wiki.example.com/a', rawContent: '#Tag #tag #Tag', rawFormat: 'yfm', references: []};
  const adapter = {kind: 'yandex-wiki', profile: config.profiles.wiki!, preflight: async () => ({}), resolvePage: async () => page, supportsSourceStatus: () => true,
    readComments: vi.fn(async () => normalizeCommentForest([{id: 'c', author: {providerId: 'u'}, body: '#Tag', inlineContext: '#inline'}], 'yfm')),
    listResources: vi.fn(() => {throw Error('resource API forbidden');}), downloadResource: vi.fn(() => {throw Error('download forbidden');}),
  };
  return {adapter};
}
describe('source-only hashtag export', () => {
  it('aggregates case-sensitive page and comment occurrences without resource calls or a mapping file', async () => {
    const {adapter} = fixture();
    const doc = await collectHashtagDecisions({adapter: adapter as unknown as SourceAdapter, locator: 'a', scope: 'page', sourceStatus: 'all', comments: true, concurrency: 1});
    expect(doc.inventory).toMatchObject({complete: true, selectedPages: 1, scannedPages: 1, scannedComments: 1});
    expect(doc.entries.map(entry => entry.tag).sort()).toEqual(['#Tag', '#inline', '#tag']);
    expect(doc.entries.find(entry => entry.tag === '#Tag')?.occurrences?.map(item => item.count).sort()).toEqual([1, 2]);
    expect(adapter.listResources).not.toHaveBeenCalled();
  });
  it('publishes private bundles and preserves partial diagnostics', async () => {
    const {adapter} = fixture();adapter.readComments.mockRejectedValue(new Error('Unavailable'));
    const doc = await collectHashtagDecisions({adapter: adapter as unknown as SourceAdapter, locator: 'a', scope: 'page', sourceStatus: 'all', comments: true, concurrency: 1});
    expect(doc.inventory).toMatchObject({complete: false, issues: [{code: 'hashtag-comments-read-failed'}]});
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ywtc-hashtag-'));
    const result = await writeHashtagBundle(path.join(dir, 'editor'), doc, '<script id="ywtc-mentions-data">{"__ywtc_mentions_payload__":true}</script>');
    expect((await stat(result.json)).mode & 0o777).toBe(0o600);expect(await readFile(result.html, 'utf8')).toContain('data-kind="hashtags"');
    await expect(writeHashtagBundle(path.join(dir, 'editor'), doc)).rejects.toThrow(/nonempty/);
  });
  it('retains an explicit interrupted inventory without provider or comment calls', async () => {
    const {adapter} = fixture();const preflight = vi.spyOn(adapter, 'preflight');
    const controller = new AbortController();controller.abort(new Error('Interrupted'));
    const document = await collectHashtagDecisions({adapter: adapter as unknown as SourceAdapter, locator: 'a', scope: 'page', sourceStatus: 'all', comments: false, concurrency: 1, signal: controller.signal});
    expect(document.inventory?.complete).toBe(false);expect(document.inventory?.issues.some(issue => issue.code === 'hashtag-export-interrupted')).toBe(true);
    expect(preflight).not.toHaveBeenCalled();expect(adapter.readComments).not.toHaveBeenCalled();
  });
});

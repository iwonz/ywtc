import {mkdir, mkdtemp, readdir, readFile, stat, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it, vi} from 'vitest';
import {normalizeCommentForest} from '../src/comments.js';
import {parseWorkspaceConfig} from '../src/config.js';
import {IncompleteSourceDiscoveryError, type SourceAdapter, type SourcePage} from '../src/domain.js';
import {collectMentionDecisions, withMentionOutput, writeMentionBundle} from '../src/mention-export.js';
import {SourceInventoryOperationError} from '../src/source-inventory.js';

const config = parseWorkspaceConfig({mentions: {mode: 'mapping', mappingFile: './missing.json'}, connections: {wiki: {
  type: 'yandex-wiki', webUrl: 'https://wiki.example.com', apiUrl: 'https://api.example.com', token: '', organization: {type: 'yandex360', id: 'org'},
}}}, '/tmp/ywtc.config.yaml');
const page = (id: string, rawContent = 'Hello @ivan'): SourcePage => ({id, canonicalId: `wiki:${id}`, provider: 'yandex-wiki', profile: 'wiki', title: id, locator: `root/${id}`, url: `https://wiki.example.com/root/${id}`, rawContent, rawFormat: 'yfm', references: [], ancestorIds: ['root']});
function adapter() {
  return {kind: 'yandex-wiki', profile: config.profiles.wiki!, preflight: vi.fn(async () => ({})),
    resolvePage: vi.fn(async () => page('root')),
    getDescendants: vi.fn(async () => ({pages: [page('child')], returned: 1, excluded: [], effectiveStatus: 'all', notes: []})),
    supportsSourceStatus: () => true,
    readComments: vi.fn(async () => normalizeCommentForest([{id: 'c', author: {providerId: 'a'}, body: '@{IVAN} and @maria', inlineContext: '@inline'}], 'yfm')),
    listResources: vi.fn(() => {throw Error('must not enumerate files or grids');}),
    downloadResource: vi.fn(() => {throw Error('must not download');}),
  };
}
describe('source-only mention export', () => {
  it('retains hydrated pages and exact selected coverage after incomplete discovery', async () => {
    const source = adapter();
    const root = {...page('root'), depth: 0}, failed = {...page('failed'), depth: 1};
    source.getDescendants.mockRejectedValue(new IncompleteSourceDiscoveryError('Incomplete', [root, failed], {requestedStatus: 'all', effectiveStatus: 'all', returnedDescendants: 1, selectedDescendants: 1, excluded: [], maximumDepth: 1, hierarchyGaps: [], notes: []}, [{page: failed, code: 'network-page-detail', message: 'Temporary outage', retryable: true}]));
    const doc = await collectMentionDecisions({adapter: source as unknown as SourceAdapter, locator: 'root', scope: 'subtree', sourceStatus: 'all', comments: false, concurrency: 1});
    expect(doc.inventory).toMatchObject({complete: false, selectedPages: 2, scannedPages: 1, issues: [{pageId: 'failed', retryable: true}]});
    expect(doc.entries).toHaveLength(1);
  });
  it('preserves typed retryability, redacts errors and reports cancellation without new requests', async () => {
    const source = adapter();source.readComments.mockRejectedValue(new SourceInventoryOperationError('comments-read', 'secret outage', true));
    const doc = await collectMentionDecisions({adapter: source as unknown as SourceAdapter, locator: 'root', scope: 'page', sourceStatus: 'current', comments: true, concurrency: 1, secrets: ['secret']});
    expect(doc.inventory?.issues[0]).toMatchObject({retryable: true, message: '[REDACTED] outage'});
    const controller = new AbortController();controller.abort(new Error('Interrupted'));source.preflight.mockClear();
    const cancelled = await collectMentionDecisions({adapter: source as unknown as SourceAdapter, locator: 'root', scope: 'page', sourceStatus: 'all', comments: true, concurrency: 1, signal: controller.signal});
    expect(cancelled.inventory?.complete).toBe(false);expect(source.preflight).not.toHaveBeenCalled();
  });
  it('shares page/comment recognition and identity aggregation without loading configured mapping', async () => {
    const source = adapter();
    const doc = await collectMentionDecisions({adapter: source as unknown as SourceAdapter, locator: 'root', scope: 'subtree', sourceStatus: 'all', comments: true, concurrency: 2});
    expect(doc.inventory).toMatchObject({complete: true, selectedPages: 2, scannedPages: 2, scannedComments: 2});
    expect(doc.entries.map(item => item.identity.username)).toEqual(['inline', 'ivan', 'maria']);
    expect(doc.entries.every(item => item.decision === 'skip')).toBe(true);
    expect(doc.entries.find(item => item.identity.username === 'ivan')?.occurrences).toHaveLength(4);
    expect(source.listResources).not.toHaveBeenCalled();
    expect(source.downloadResource).not.toHaveBeenCalled();
  });
  it('retains partial results on failed comments and performs no comment calls when disabled', async () => {
    const source = adapter();source.readComments.mockRejectedValue(new Error('Unavailable'));
    const doc = await collectMentionDecisions({adapter: source as unknown as SourceAdapter, locator: 'root', scope: 'page', sourceStatus: 'all', comments: true, concurrency: 1});
    expect(doc.inventory?.complete).toBe(false);expect(doc.entries).toHaveLength(1);
    source.readComments.mockClear();
    await collectMentionDecisions({adapter: source as unknown as SourceAdapter, locator: 'root', scope: 'page', sourceStatus: 'all', comments: false, concurrency: 1});
    expect(source.readComments).not.toHaveBeenCalled();
  });
  it('writes a private singlefile bundle and rejects a nonempty output without overwriting it', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ywtc-mention-export-'));
    const document = await collectMentionDecisions({adapter: adapter() as unknown as SourceAdapter, locator: 'root', scope: 'page', sourceStatus: 'all', comments: false, concurrency: 1});
    const output = path.join(root, 'mentions');
    await writeMentionBundle(output, document, '<html><script type="application/json">{"__ywtc_mentions_payload__":true}</script></html>');
    expect((await stat(path.join(output, 'decisions.json'))).mode & 0o777).toBe(0o600);
    expect((await stat(path.join(output, 'index.html'))).mode & 0o777).toBe(0o600);
    expect(await readdir(output)).toEqual(['decisions.json', 'index.html']);
    expect(JSON.parse(await readFile(path.join(output, 'decisions.json'), 'utf8'))).toEqual(document);
    await writeFile(path.join(output, 'keep'), 'user data');
    await expect(writeMentionBundle(output, document)).rejects.toThrow(/nonempty/i);
    expect(await readFile(path.join(output, 'keep'), 'utf8')).toBe('user data');
  });
  it('accepts a genuinely empty output and excludes a second concurrent exporter', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ywtc-mention-lease-')), output = path.join(root, 'empty');await mkdir(output);
    await withMentionOutput(output, async () => {
      await expect(withMentionOutput(output, async () => undefined)).rejects.toMatchObject({code: 'EEXIST'});
      const doc = await collectMentionDecisions({adapter: adapter() as unknown as SourceAdapter, locator: 'root', scope: 'page', sourceStatus: 'all', comments: false, concurrency: 1});
      await writeMentionBundle(output, doc, '<script>{"__ywtc_mentions_payload__":true}</script>');
    });
    expect(await readdir(root)).toEqual(['empty']);
  });
});

import {createHash} from 'node:crypto';
import {mkdir, mkdtemp, readFile, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {normalizeCommentForest} from '../src/comments.js';
import type {AppConfig, ConnectionProfile, ConfluenceConnectionProfile, YandexConnectionProfile} from '../src/config.js';
import type {
  CommentInventory,
  DestinationAdapter,
  DestinationComment,
  DestinationContainer,
  DestinationPage,
  SourceAdapter,
  SourcePage,
  SourceResource,
  UploadedResource,
} from '../src/domain.js';
import {createLogger} from '../src/logger.js';
import {MigrationRunError, Migrator} from '../src/migrator.js';
import type {RemoteLocator} from '../src/locators.js';

const limits = {readConcurrency: 2, writeConcurrency: 1, downloadConcurrency: 1, uploadConcurrency: 1, requestsPerSecond: 20, burst: 20};
const sourceProfile: YandexConnectionProfile = {
  name: 'source', type: 'yandex-wiki', apiUrl: 'https://api.example.test/v1', webUrl: 'https://wiki.example.test',
  authType: 'oauth', token: 'token', organization: {type: 'yandex360', id: 'org'}, limits,
};
const destinationProfile: ConfluenceConnectionProfile = {
  name: 'destination', type: 'confluence', deployment: 'data-center', baseUrl: 'https://conf.example.test',
  authType: 'pat', token: 'token', limits,
};

function digest(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function fixture(options: {rejectNativeArchive?: boolean; rejectNativeSize?: boolean; onArchiveUpload?: () => void} = {}) {
  const root: SourcePage = {
    provider: 'yandex-wiki', profile: 'source', id: '1', canonicalId: 'source:yandex-wiki:1', title: 'Root', locator: 'root',
    url: 'https://wiki.example.test/root', rawContent: 'Page body', rawFormat: 'yfm', references: [],
  };
  const resource: SourceResource = {
    provider: 'yandex-wiki', id: 'r1', pageId: '1', name: 'spec.pdf', preferredName: 'spec.pdf',
    referenceAliases: ['files/spec.pdf'], size: 10, mimeType: 'application/pdf', kind: 'attachment',
  };
  let commentText = 'Decision [spec](files/spec.pdf)';
  let commentReads = 0;
  let commentCreates = 0;
  let commentUpdates = 0;
  let commentReadError: Error | undefined;
  let page: DestinationPage | undefined;
  let archiveComment: DestinationComment | undefined;
  const uploaded = new Map<string, {resource: UploadedResource; bytes: Buffer}>();
  const inventory = (): CommentInventory => normalizeCommentForest([
    {id: 'c1', author: {providerId: 'u1', displayName: 'Иван', username: 'ivan'}, createdAt: '2026-01-01', body: commentText},
    {id: 'c2', parentId: 'c1', author: {providerId: 'u2', email: 'anna@example.com'}, createdAt: '2026-01-02', body: 'Reply'},
  ], 'yfm');
  const source = {
    profile: sourceProfile,
    kind: 'yandex-wiki' as const,
    capabilities: {readPages: true, readHierarchy: true, readResources: true, writePages: true, writeResources: true, verifyWrites: true, readComments: true, writeComments: true, updateComments: false},
    preflight: async () => ({product: 'Yandex Wiki', warnings: []}),
    resolvePage: async () => ({...root}),
    getPage: async () => ({...root}),
    supportsSourceStatus: () => true,
    getDescendants: async () => ({pages: [], returned: 0, excluded: [], effectiveStatus: 'all' as const, notes: []}),
    resolveReference: async () => undefined,
    listResources: async () => [resource],
    readComments: async () => {
      commentReads += 1;
      if (commentReadError) throw commentReadError;
      return inventory();
    },
    downloadResource: async (_item: SourceResource, destination: string) => {
      await mkdir(path.dirname(destination), {recursive: true});
      await writeFile(destination, '0123456789');
      return {path: destination, size: 10, sha256: digest('0123456789'), mimeType: 'application/pdf'};
    },
  } as SourceAdapter;
  const destination = {
    profile: destinationProfile,
    kind: 'confluence' as const,
    capabilities: {readPages: true, readHierarchy: true, readResources: true, writePages: true, writeResources: true, verifyWrites: true, reparentPages: true, readComments: true, writeComments: true, updateComments: true},
    preflight: async () => ({product: 'Confluence', warnings: []}),
    resolveContainer: async (): Promise<DestinationContainer> => ({provider: 'confluence', profile: 'destination', id: '100', canonicalId: 'destination:100', title: 'Archive', url: 'https://conf.example.test/pages/100', space: 'DOC'}),
    findChild: async () => page,
    createPage: async ({container, title, body}) => {
      page = {provider: 'confluence', profile: 'destination', id: '200', canonicalId: 'destination:200', title, url: 'https://conf.example.test/pages/200', space: 'DOC', parentId: container.id, content: body, fingerprint: digest(body), contentFingerprint: digest(body)};
      return page;
    },
    updatePage: async ({page: current, body}) => {
      page = {...current, content: body, fingerprint: digest(body), contentFingerprint: digest(body)};
      return page;
    },
    uploadResource: async ({name, filePath}) => {
      const bytes = await readFile(filePath);
      const result = {id: `a${uploaded.size + 1}`, name, size: bytes.length};
      uploaded.set(result.id, {resource: result, bytes});
      if (name.endsWith('.zip')) options.onArchiveUpload?.();
      return result;
    },
    listUploadedResources: async () => [...uploaded.values()].map((item) => item.resource),
    downloadUploadedResource: async ({resource: item, destination: filename}) => {
      const stored = uploaded.get(item.id)!;
      await mkdir(path.dirname(filename), {recursive: true});
      await writeFile(filename, stored.bytes);
      return {path: filename, size: stored.bytes.length, sha256: digest(stored.bytes)};
    },
    verifyPage: async () => page!,
    renderPageReference: (target: DestinationPage, label: string) => `<a href="${target.url}">${label}</a>`,
    renderResourceReference: (item: UploadedResource, label: string) => `<ri:attachment ri:filename="${item.name}">${label}</ri:attachment>`,
    findArchiveComment: async (_page: DestinationPage, fingerprint?: string) => archiveComment && (!fingerprint || archiveComment.body.includes(fingerprint)) ? archiveComment : undefined,
    createArchiveComment: async ({page: target, body}) => {
      if (options.rejectNativeSize && body.includes('ac:name="expand"')) throw Object.assign(new Error('payload too large'), {status: 413});
      if (options.rejectNativeArchive && body.includes('ac:name="expand"')) throw new Error('expand macro rejected');
      commentCreates += 1;
      archiveComment = {id: `comment-${commentCreates}`, pageId: target.id, body, version: '1', fingerprint: digest(body)};
      return archiveComment;
    },
    updateArchiveComment: async ({comment, body}) => {
      if (options.rejectNativeSize && body.includes('ac:name="expand"')) throw Object.assign(new Error('payload too large'), {status: 413});
      if (options.rejectNativeArchive && body.includes('ac:name="expand"')) throw new Error('expand macro rejected');
      commentUpdates += 1;
      archiveComment = {...comment, body, version: String(Number(comment.version ?? '1') + 1), fingerprint: digest(body)};
      return archiveComment;
    },
    readArchiveComment: async () => {
      if (!archiveComment) throw new Error('comment not found');
      return archiveComment;
    },
  } as DestinationAdapter;
  return {
    source,
    destination,
    changeComment(value: string) { commentText = value; },
    failCommentRead(error = new Error('comment API unavailable')) { commentReadError = error; },
    manuallyEditComment() { if (archiveComment) archiveComment = {...archiveComment, body: `${archiveComment.body} manual`, fingerprint: digest(`${archiveComment.body} manual`)}; },
    counts: () => ({commentReads, commentCreates, commentUpdates, uploads: uploaded.size}),
    page: () => page,
    commentBody: () => archiveComment?.body,
    uploadedNames: () => [...uploaded.values()].map((item) => item.resource.name),
  };
}

async function setup() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ywtc-migration-comments-'));
  const config: AppConfig = {profiles: {source: sourceProfile, destination: destinationProfile}, timeoutMs: 5_000, concurrency: 2, configFile: path.join(directory, 'ywtc.config.yaml')};
  const source: RemoteLocator = {type: 'remote', profile: sourceProfile, value: 'root'};
  const destination: RemoteLocator = {type: 'remote', profile: destinationProfile, value: '100'};
  return {
    directory,
    config,
    options: {
      source, destination, scope: 'page' as const, dryRun: false, archive: false, concurrency: 2,
      runtimeDirectory: path.join(directory, '.states'), cacheDirectory: path.join(directory, '.states/cache'), reportsDirectory: path.join(directory, '.states/reports'),
    },
  };
}

describe('comment migration pipeline', () => {
  it('archives comments by default, reuses unchanged data, updates changed Confluence archives, and protects manual edits', async () => {
    const {config, options} = await setup();
    const adapters = fixture();
    const factory = (profile: ConnectionProfile) => (profile.name === 'source' ? adapters.source : adapters.destination) as SourceAdapter & DestinationAdapter;
    const migrator = new Migrator(config, createLogger([]), factory);
    const first = await migrator.run(options);
    expect(first.status).toBe('completed');
    expect(first.summary).toMatchObject({comments: 2, commentThreads: 1, commentAttachments: 1, complete: 1});
    expect(adapters.counts()).toMatchObject({commentReads: 1, commentCreates: 1, commentUpdates: 0, uploads: 2});

    await migrator.run(options);
    expect(adapters.counts()).toMatchObject({commentReads: 2, commentCreates: 1, commentUpdates: 0, uploads: 2});

    adapters.changeComment('Changed decision [spec](files/spec.pdf)');
    const changed = await migrator.run(options);
    expect(changed.status).toBe('completed');
    expect(adapters.counts()).toMatchObject({commentCreates: 1, commentUpdates: 1});

    adapters.manuallyEditComment();
    adapters.changeComment('Another change [spec](files/spec.pdf)');
    const conflict = await migrator.run(options);
    expect(conflict.status).toBe('partial');
    expect(conflict.summary.commentStatuses.conflict).toBe(1);
    expect(adapters.counts()).toMatchObject({commentUpdates: 1});
  });

  it('does not call comment APIs with --no-comments and records a skipped archive outcome', async () => {
    const {config, options} = await setup();
    const adapters = fixture();
    const factory = (profile: ConnectionProfile) => (profile.name === 'source' ? adapters.source : adapters.destination) as SourceAdapter & DestinationAdapter;
    const result = await new Migrator(config, createLogger([]), factory).run({...options, comments: false});
    expect(result.status).toBe('completed');
    expect(result.summary.commentStatuses.skipped).toBe(1);
    expect(adapters.counts()).toMatchObject({commentReads: 0, commentCreates: 0, commentUpdates: 0});
  });

  it('uses a readable fallback when native collapsible markup is rejected', async () => {
    const {config, options} = await setup();
    const adapters = fixture({rejectNativeArchive: true});
    const factory = (profile: ConnectionProfile) => (profile.name === 'source' ? adapters.source : adapters.destination) as SourceAdapter & DestinationAdapter;
    const result = await new Migrator(config, createLogger([]), factory).run(options);
    expect(result.status).toBe('completed-with-warnings');
    expect(result.summary).toMatchObject({partial: 1, comments: 2, commentStatuses: {partial: 1}});
    expect(adapters.counts()).toMatchObject({commentCreates: 1});
  });

  it('keeps the page content when source comments cannot be read', async () => {
    const {config, options} = await setup();
    const adapters = fixture();
    adapters.failCommentRead();
    const factory = (profile: ConnectionProfile) => (profile.name === 'source' ? adapters.source : adapters.destination) as SourceAdapter & DestinationAdapter;
    const result = await new Migrator(config, createLogger([]), factory).run(options);
    expect(result.status).toBe('partial');
    expect(result.summary).toMatchObject({partial: 1, errors: 1, commentStatuses: {failed: 1}});
    expect(adapters.page()?.content).toContain('Page body');
  });

  it('attaches a full Markdown archive when destination rejects the inline size', async () => {
    const {config, options} = await setup();
    const adapters = fixture({rejectNativeSize: true});
    const factory = (profile: ConnectionProfile) => (profile.name === 'source' ? adapters.source : adapters.destination) as SourceAdapter & DestinationAdapter;
    const result = await new Migrator(config, createLogger([]), factory).run(options);
    expect(result.status).toBe('completed-with-warnings');
    expect(result.summary.commentStatuses.partial).toBe(1);
    expect(adapters.uploadedNames()).toEqual(expect.arrayContaining([expect.stringMatching(/\.md$/), expect.stringMatching(/\.zip$/)]));
    expect(adapters.commentBody()).toContain('Полный архив');
    expect(adapters.commentBody()).not.toContain('ac:name="expand"');
  });

  it('checkpoints a cancelled run without creating a comment after interruption', async () => {
    const {config, options} = await setup();
    const controller = new AbortController();
    const adapters = fixture({onArchiveUpload: () => controller.abort(new Error('test interruption'))});
    const factory = (profile: ConnectionProfile) => (profile.name === 'source' ? adapters.source : adapters.destination) as SourceAdapter & DestinationAdapter;
    const error = await new Migrator(config, createLogger([]), factory).run({...options, signal: controller.signal}).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(MigrationRunError);
    const report = JSON.parse(await readFile((error as MigrationRunError).reportPaths.json, 'utf8')) as {status: string};
    expect(report.status).toBe('cancelled');
    expect(adapters.counts().commentCreates).toBe(0);
    expect(adapters.page()?.content).toContain('Page body');
  });
});

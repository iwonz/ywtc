import {createHash} from 'node:crypto';
import {mkdir, mkdtemp, readFile, stat, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type {Readable} from 'node:stream';
import {describe, expect, it} from 'vitest';
import type {AppConfig} from '../src/config.js';
import type {Logger} from '../src/logger.js';
import {Migrator} from '../src/migrator.js';
import type {
  ConfluenceApi,
  ConfluenceAttachment,
  ConfluencePage,
  DownloadedFile,
  YandexAttachment,
  YandexGrid,
  YandexGridSummary,
  YandexPageDetails,
  YandexPageIdentity,
  YandexWikiApi,
} from '../src/types.js';

const config: AppConfig = {
  yandex: {
    token: 'wiki-secret',
    authType: 'oauth',
    orgId: '42',
    orgType: 'yandex360',
    apiUrl: 'https://api.wiki.yandex.net/v1',
    webUrl: 'https://wiki.yandex.ru',
  },
  confluence: {baseUrl: 'https://conf.example.test/confluence', token: 'conf-secret'},
  timeoutMs: 5_000,
  concurrency: 2,
  networkLimits: {
    yandex: {apiConcurrency: 2, downloadConcurrency: 1, requestsPerSecond: 20, burst: 20},
    confluence: {readConcurrency: 2, writeConcurrency: 1, uploadConcurrency: 1, requestsPerSecond: 20, burst: 20},
  },
};

const logger: Logger = {info() {}, warn() {}, error() {}};

class FakeYandex implements YandexWikiApi {
  descendantRequests = 0;

  readonly pages: YandexPageDetails[] = [
    {
      id: 1,
      slug: 'root',
      title: 'Root',
      page_type: 'wysiwyg',
      content: '# Root\n\n[Child](/root/child)\n\n![Logo](logo.png)',
    },
    {
      id: 2,
      slug: 'root/child',
      title: 'Child',
      page_type: 'wysiwyg',
      content: 'Child body',
      breadcrumbs: [{id: 1, slug: 'root', title: 'Root'}],
    },
  ];

  async getPageBySlug(slug: string): Promise<YandexPageDetails> {
    return this.pages.find((page) => page.slug === slug)!;
  }

  async getPageById(id: number): Promise<YandexPageDetails> {
    return this.pages.find((page) => page.id === id)!;
  }

  async getDescendants(): Promise<YandexPageIdentity[]> {
    this.descendantRequests += 1;
    return [{id: 2, slug: 'root/child'}];
  }

  async getAttachments(pageId: number): Promise<YandexAttachment[]> {
    return pageId === 1 ? [{id: 10, name: 'logo.png', is_downloadable: true, download_url: 'https://download.test/logo.png', size: 4, mimetype: 'image/png'}] : [];
  }

  async getPageGrids(pageId: number): Promise<YandexGridSummary[]> {
    return pageId === 2 ? [{id: 'grid-1', title: 'Grid'}] : [];
  }

  async getGrid(): Promise<YandexGrid> {
    return {
      id: 'grid-1',
      title: 'Grid',
      structure: {columns: [{slug: 'name', title: 'Name'}]},
      rows: [{id: 'row-1', row: ['Value']}],
    };
  }

  async download(_pageId: number, _attachmentId: number, destination: string): Promise<DownloadedFile> {
    const body = Buffer.from('logo');
    await mkdir(path.dirname(destination), {recursive: true});
    await writeFile(destination, body);
    return {
      path: destination,
      size: body.length,
      sha256: createHash('sha256').update(body).digest('hex'),
      mimeType: 'image/png',
    };
  }
}

class FakeConfluence implements ConfluenceApi {
  readonly pages = new Map<string, ConfluencePage>();
  readonly bodies = new Map<string, string>();
  readonly parentIds = new Map<string, string>();
  readonly attachments = new Map<string, ConfluenceAttachment[]>();
  creates = 0;
  updates = 0;
  uploads = 0;
  nextId = 200;

  constructor() {
    this.pages.set('100', {
      id: '100',
      type: 'page',
      title: 'Destination',
      space: {key: 'DOC'},
      version: {number: 1},
      body: {storage: {value: '<p>Target</p>', representation: 'storage'}},
      operations: [
        {operation: 'read', targetType: 'page'},
        {operation: 'update', targetType: 'page'},
      ],
    });
  }

  async resolveTarget(): Promise<ConfluencePage> { return this.pages.get('100')!; }
  async getPage(id: string): Promise<ConfluencePage> { return this.pages.get(id)!; }
  async findPageByTitle(_spaceKey: string, title: string): Promise<ConfluencePage | undefined> {
    return [...this.pages.values()].find((page) => page.title === title);
  }

  async createPage(input: {spaceKey: string; parentId: string; title: string; storage: string}): Promise<ConfluencePage> {
    this.creates += 1;
    const id = String(this.nextId++);
    const page: ConfluencePage = {id, type: 'page', title: input.title, space: {key: input.spaceKey}, version: {number: 1}, body: {storage: {value: input.storage, representation: 'storage'}}};
    this.pages.set(id, page);
    this.bodies.set(id, input.storage);
    this.parentIds.set(id, input.parentId);
    return page;
  }

  async updatePage(input: {pageId: string; title: string; storage: string}): Promise<ConfluencePage> {
    this.updates += 1;
    const current = this.pages.get(input.pageId)!;
    const page: ConfluencePage = {...current, title: input.title, version: {number: (current.version?.number ?? 0) + 1}, body: {storage: {value: input.storage, representation: 'storage'}}};
    this.pages.set(input.pageId, page);
    this.bodies.set(input.pageId, input.storage);
    return page;
  }

  async findAttachment(pageId: string, filename: string): Promise<ConfluenceAttachment | undefined> {
    return this.attachments.get(pageId)?.find((item) => item.title === filename);
  }

  async uploadAttachment(input: {pageId: string; filename: string; file: Readable}): Promise<ConfluenceAttachment> {
    this.uploads += 1;
    for await (const chunk of input.file) void chunk;
    const attachment = {id: `att-${this.uploads}`, title: input.filename};
    const list = this.attachments.get(input.pageId) ?? [];
    const filtered = list.filter((item) => item.title !== input.filename);
    filtered.push(attachment);
    this.attachments.set(input.pageId, filtered);
    return attachment;
  }

  async listAttachments(pageId: string): Promise<ConfluenceAttachment[]> { return this.attachments.get(pageId) ?? []; }
  pageWebUrl(page: ConfluencePage): string { return `https://conf.example.test/confluence/pages/viewpage.action?pageId=${page.id}`; }
}

describe('migration pipeline', () => {
  it('creates a hierarchy, resources and links, then resumes without duplicates', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'ywtc-migration-'));
    const stateFilename = path.join(directory, 'state.json');
    const yandex = new FakeYandex();
    const confluence = new FakeConfluence();
    const migrator = new Migrator({yandex, confluence, config, logger, secrets: ['wiki-secret', 'conf-secret']});

    const first = await migrator.run({sourceSlug: 'root', target: '100', dryRun: false, singlePage: false, concurrency: 2, stateFilename});
    expect(first.hasErrors).toBe(false);
    expect(confluence.creates).toBe(2);
    expect(confluence.parentIds.get('200')).toBe('100');
    expect(confluence.parentIds.get('201')).toBe('200');
    expect(confluence.bodies.get('200')).toContain('ri:content-title="Child"');
    expect(confluence.bodies.get('200')).toContain('ri:filename="logo.png"');
    expect(confluence.bodies.get('201')).toContain('<th>Name</th>');
    expect(confluence.uploads).toBe(1);

    const second = await migrator.run({sourceSlug: 'root', target: '100', dryRun: false, singlePage: false, concurrency: 2, stateFilename});
    expect(second.hasErrors).toBe(false);
    expect(confluence.creates).toBe(2);
    expect(confluence.uploads).toBe(1);
    expect(confluence.updates).toBe(4);
  });

  it('automatically reuses canonical state and preserves it before a fresh live run', async () => {
    const runtimeDirectory = await mkdtemp(path.join(os.tmpdir(), 'wiki-auto-state-'));
    const confluence = new FakeConfluence();
    const migrator = new Migrator({yandex: new FakeYandex(), confluence, config, logger});
    const common = {
      sourceSlug: 'root',
      target: '100',
      dryRun: false,
      singlePage: false,
      concurrency: 2,
      runtimeDirectory,
    };

    const first = await migrator.run(common);
    const second = await migrator.run(common);
    expect(second.stateId).toBe(first.stateId);
    expect(second.stateFilename).toBe(first.stateFilename);
    expect(confluence.creates).toBe(2);

    const fresh = await migrator.run({...common, fresh: true});
    expect(fresh.stateFilename).toBe(first.stateFilename);
    expect(fresh.stateBackupFilename).toMatch(/\.backup-/);
    await expect(stat(fresh.stateBackupFilename!)).resolves.toBeDefined();
    expect(confluence.creates).toBe(4);
  });

  it('migrates only the selected page and leaves mapped descendants untouched', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'wiki-single-page-'));
    const stateFilename = path.join(directory, 'state.json');
    const yandex = new FakeYandex();
    const confluence = new FakeConfluence();
    const migrator = new Migrator({yandex, confluence, config, logger});

    await migrator.run({sourceSlug: 'root', target: '100', dryRun: false, singlePage: false, concurrency: 2, stateFilename});
    const descendantRequestsBefore = yandex.descendantRequests;
    const childBefore = confluence.pages.get('201');
    const childBodyBefore = confluence.bodies.get('201');
    const updatesBefore = confluence.updates;

    const result = await migrator.run({sourceSlug: 'root', target: '100', dryRun: false, singlePage: true, concurrency: 2, stateFilename});

    expect(result.hasErrors).toBe(false);
    expect(yandex.descendantRequests).toBe(descendantRequestsBefore);
    expect(confluence.creates).toBe(2);
    expect(confluence.updates - updatesBefore).toBe(1);
    expect(confluence.pages.get('201')).toEqual(childBefore);
    expect(confluence.bodies.get('201')).toBe(childBodyBefore);
    expect(confluence.bodies.get('200')).toContain('href="https://wiki.yandex.ru/root/child"');
    expect(confluence.bodies.get('200')).not.toContain('ri:content-title="Child"');

    const report = JSON.parse(await readFile(result.reportPaths.json, 'utf8')) as {
      summary: {pages: number; descendants: number};
      staleDestinationPageIds: string[];
    };
    expect(report.summary).toMatchObject({pages: 1, descendants: 0});
    expect(report.staleDestinationPageIds).toEqual([]);
    const state = JSON.parse(await readFile(stateFilename, 'utf8')) as {pages: Record<string, unknown>};
    expect(Object.keys(state.pages)).toEqual(['1', '2']);
  });

  it('keeps dry-run free of Confluence mutations and state writes', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'wiki-dry-run-'));
    const stateFilename = path.join(directory, 'state.json');
    const confluence = new FakeConfluence();
    const migrator = new Migrator({yandex: new FakeYandex(), confluence, config, logger});
    const result = await migrator.run({sourceSlug: 'root', target: '100', dryRun: true, singlePage: false, concurrency: 2, stateFilename});

    expect(result.hasErrors).toBe(false);
    expect(confluence.creates).toBe(0);
    expect(confluence.updates).toBe(0);
    await expect(stat(stateFilename)).rejects.toMatchObject({code: 'ENOENT'});
    await expect(stat(result.reportPaths.directory)).resolves.toBeDefined();
    await expect(stat(result.reportPaths.html)).resolves.toBeDefined();
    await expect(stat(result.reportPaths.json)).resolves.toBeDefined();
    const report = JSON.parse(await readFile(result.reportPaths.json, 'utf8')) as {summary: {pages: number; attachments: number; dynamicTables: number; links: {internal: number}}};
    expect(report.summary).toMatchObject({pages: 2, attachments: 1, dynamicTables: 1});
    expect(report.summary.links.internal).toBe(1);
    expect(await readFile(result.reportPaths.html, 'utf8')).toContain('Page comparison');
  });

  it('does not create automatic state during a fresh dry-run', async () => {
    const runtimeDirectory = await mkdtemp(path.join(os.tmpdir(), 'wiki-auto-dry-run-'));
    const selectedDirectory = path.join(runtimeDirectory, 'states');
    const confluence = new FakeConfluence();
    const migrator = new Migrator({yandex: new FakeYandex(), confluence, config, logger});
    const result = await migrator.run({
      sourceSlug: 'root',
      target: '100',
      dryRun: true,
      singlePage: false,
      fresh: true,
      concurrency: 2,
      runtimeDirectory,
    });

    expect(result.stateFilename).toBe(path.join(runtimeDirectory, `${result.stateId}.json`));
    await expect(stat(result.stateFilename)).rejects.toMatchObject({code: 'ENOENT'});
    await expect(stat(selectedDirectory)).rejects.toMatchObject({code: 'ENOENT'});
    await expect(stat(result.reportPaths.directory)).resolves.toBeDefined();
  });

  it('refuses to create or overwrite pages when Yandex omits the requested content field', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'wiki-missing-content-'));
    const stateFilename = path.join(directory, 'state.json');
    const yandex = new FakeYandex();
    delete yandex.pages[0]!.content;
    const confluence = new FakeConfluence();
    const migrator = new Migrator({yandex, confluence, config, logger});

    await expect(migrator.run({sourceSlug: 'root', target: '100', dryRun: false, singlePage: false, concurrency: 2, stateFilename}))
      .rejects.toThrow('refusing to replace the Confluence body with an empty page');
    expect(confluence.creates).toBe(0);
    expect(confluence.updates).toBe(0);
  });
});

import {mkdtemp, readFile, readdir, stat, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {
  migrationStateId,
  resolveStateLocation,
  StateStore,
  type CanonicalMigrationIdentity,
} from '../src/state.js';

const canonicalIdentity: CanonicalMigrationIdentity = {
  yandexApiUrl: 'https://api.wiki.example.test/v1',
  yandexWebUrl: 'https://wiki.example.test',
  yandexOrgId: '42',
  yandexOrgType: 'yandex360',
  sourcePageId: 1,
  confluenceBaseUrl: 'https://confluence.example.test/confluence',
  targetPageId: '100',
  spaceKey: 'DOC',
};

describe('migration state', () => {
  it('writes and reloads atomic state without credentials', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'ywtc-state-'));
    const filename = path.join(directory, 'state.json');
    const identity = {sourceRootSlug: 'root', targetPageId: '100', spaceKey: 'DOC'};
    const store = new StateStore(filename);
    await store.load(identity);
    await store.setPage({
      sourceId: 1,
      sourceSlug: 'root',
      sourceTitle: 'Root',
      destinationId: '200',
      destinationTitle: 'Root',
      status: 'complete',
      attachments: {},
      updatedAt: new Date().toISOString(),
    });

    const raw = await readFile(filename, 'utf8');
    expect(raw).toContain('"destinationId": "200"');
    expect(raw).not.toContain('token');
    const reloaded = await new StateStore(filename).load(identity);
    expect(reloaded.pages['1']?.status).toBe('complete');
  });

  it('refuses to reuse state for another migration', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'ywtc-state-'));
    const filename = path.join(directory, 'state.json');
    const store = new StateStore(filename);
    await store.load({sourceRootSlug: 'root', targetPageId: '100', spaceKey: 'DOC'});
    await store.save();
    await expect(new StateStore(filename).load({sourceRootSlug: 'other', targetPageId: '100', spaceKey: 'DOC'})).rejects.toThrow(/belongs to source.*resolved source/);
  });

  it('serializes concurrent atomic saves without losing page mappings', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'ywtc-state-concurrent-'));
    const filename = path.join(directory, 'state.json');
    const identity = {sourceRootSlug: 'root', targetPageId: '100', spaceKey: 'DOC'};
    const store = new StateStore(filename);
    await store.load(identity);
    const page = (sourceId: number) => ({
      sourceId,
      sourceSlug: `root/${sourceId}`,
      sourceTitle: `Page ${sourceId}`,
      destinationId: String(200 + sourceId),
      destinationTitle: `Page ${sourceId}`,
      status: 'complete' as const,
      attachments: {},
      updatedAt: new Date().toISOString(),
    });

    await Promise.all([store.setPage(page(1)), store.setPage(page(2))]);
    const reloaded = await new StateStore(filename).load(identity);
    expect(Object.keys(reloaded.pages).sort()).toEqual(['1', '2']);
  });

  it('derives one credential-free ID and path from equivalent normalized endpoints', () => {
    const equivalent = {
      ...canonicalIdentity,
      yandexApiUrl: `${canonicalIdentity.yandexApiUrl}/`,
      yandexWebUrl: `${canonicalIdentity.yandexWebUrl}/`,
      confluenceBaseUrl: `${canonicalIdentity.confluenceBaseUrl}/`,
    };
    const id = migrationStateId(canonicalIdentity);
    expect(id).toMatch(/^[a-f0-9]{24}$/);
    expect(migrationStateId(equivalent)).toBe(id);
    expect(migrationStateId({...canonicalIdentity, targetPageId: '101'})).not.toBe(id);
    expect(migrationStateId({...canonicalIdentity, confluenceDeployment: 'data-center'})).toBe(id);
    expect(migrationStateId({...canonicalIdentity, confluenceDeployment: 'cloud', confluenceSpaceId: 'space-1'})).not.toBe(id);
    expect(JSON.stringify(resolveStateLocation(canonicalIdentity))).not.toContain('token');

    const location = resolveStateLocation(canonicalIdentity);
    expect(location).toEqual({
      id,
      mode: 'automatic',
      filename: path.join('.states', `${id}.json`),
      runtimeDirectory: '.states',
      cacheDirectory: path.join('.states', 'cache'),
      reportsDirectory: path.join('.states', 'reports'),
    });
  });

  it('backs up selected live state for --fresh and starts with empty mappings', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'ywtc-state-fresh-'));
    const filename = path.join(directory, 'state.json');
    const identity = {sourceRootSlug: 'root', targetPageId: '100', spaceKey: 'DOC'};
    const existing = new StateStore(filename);
    await existing.load(identity);
    await existing.save();

    const fresh = new StateStore(filename);
    const state = await fresh.load(identity, {fresh: true});
    expect(state.pages).toEqual({});
    expect(fresh.loadInfo.source).toBe('fresh');
    expect(fresh.loadInfo.backupFilename).toMatch(/\.backup-/);
    await expect(stat(fresh.loadInfo.backupFilename!)).resolves.toBeDefined();
    await expect(stat(filename)).rejects.toMatchObject({code: 'ENOENT'});
    await fresh.save();
    await expect(stat(filename)).resolves.toBeDefined();
  });

  it('keeps --fresh --dry-run state completely unchanged', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'ywtc-state-fresh-dry-'));
    const filename = path.join(directory, 'state.json');
    const identity = {sourceRootSlug: 'root', targetPageId: '100', spaceKey: 'DOC'};
    const existing = new StateStore(filename);
    await existing.load(identity);
    await existing.save();
    const before = await readFile(filename, 'utf8');

    const fresh = new StateStore(filename);
    await fresh.load(identity, {fresh: true, dryRun: true});
    expect(fresh.loadInfo).toEqual({source: 'fresh'});
    expect(await readFile(filename, 'utf8')).toBe(before);
    expect((await readdir(directory)).filter((name) => name.includes('.backup-'))).toEqual([]);
    await expect(fresh.save()).rejects.toThrow(/during --dry-run/);
  });

  it('reports malformed state with its path and recovery actions', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'ywtc-state-invalid-'));
    const filename = path.join(directory, 'state.json');
    await writeFile(filename, '{not json');
    await expect(new StateStore(filename).load({sourceRootSlug: 'root', targetPageId: '100', spaceKey: 'DOC'}))
      .rejects.toThrow(/not valid JSON.*--fresh/);
  });

  it('refuses to rotate a directory supplied as a fresh state file', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'ywtc-state-directory-'));
    const identity = {sourceRootSlug: 'root', targetPageId: '100', spaceKey: 'DOC'};
    await expect(new StateStore(directory).load(identity, {fresh: true})).rejects.toThrow(/not a regular file/);
    await expect(stat(directory)).resolves.toBeDefined();
  });
});

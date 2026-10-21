import {randomUUID} from 'node:crypto';
import {mkdtemp, readFile, stat, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {normalizePageContent} from '../src/content-model.js';
import type {SourcePage, SourceResource} from '../src/domain.js';
import {SourceInventoryStore} from '../src/source-inventory.js';

const stateId = '1234567890abcdef12345678';

function page(locator = 'root'): SourcePage {
  return {
    provider: 'yandex-wiki',
    profile: 'wiki',
    id: '10',
    canonicalId: 'wiki:yandex-wiki:10',
    title: 'Root',
    locator,
    url: `https://wiki.example.com/${locator}`,
    rawContent: '# Root\n\nBody',
    rawFormat: 'yfm',
    references: [],
  };
}

function options(cacheDirectory: string, overrides: Partial<Parameters<typeof SourceInventoryStore.open>[0]> = {}) {
  return {
    cacheDirectory,
    stateId,
    runId: randomUUID(),
    sourceCanonicalId: page().canonicalId,
    sourceProfile: 'wiki',
    sourceProvider: 'yandex-wiki',
    scope: 'subtree' as const,
    sourceStatus: 'all' as const,
    commentsEnabled: true,
    fresh: false,
    ...overrides,
  };
}

async function manifest(cacheDirectory: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path.join(cacheDirectory, 'inventory', stateId, 'manifest.json'), 'utf8')) as Record<string, unknown>;
}

describe('source inventory snapshots', () => {
  it('atomically reuses a complete owner-only page checkpoint', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'ywtc-inventory-'));
    const first = await SourceInventoryStore.open(options(directory));
    const sourcePage = page();
    const resources: SourceResource[] = [{
      provider: 'yandex-wiki', id: 'file', pageId: sourcePage.id, name: 'file.txt', kind: 'attachment',
    }];
    await first.saveComplete({page: sourcePage, resources, document: normalizePageContent(sourcePage)});
    await first.markReady();

    const second = await SourceInventoryStore.open(options(directory));
    expect(second.reused).toBe(true);
    await expect(second.loadComplete(sourcePage)).resolves.toMatchObject({stage: 'complete', resources});

    const current = await manifest(directory);
    const record = path.join(directory, 'inventory', stateId, String(current.generation), 'pages');
    expect((await stat(path.join(directory, 'inventory', stateId, 'manifest.json'))).mode & 0o777).toBe(0o600);
    expect((await stat(record)).mode & 0o777).toBe(0o700);
  });

  it('refreshes locator drift and does not accept the old complete record', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'ywtc-inventory-'));
    const store = await SourceInventoryStore.open(options(directory));
    const original = page();
    await store.saveComplete({page: original, resources: [], document: normalizePageContent(original)});
    const moved = page('renamed/root');
    await expect(store.loadDiscoveredPage(moved.canonicalId, moved.locator)).resolves.toBeUndefined();
    await expect(store.loadComplete(moved)).resolves.toBeUndefined();
  });

  it('starts a new generation for fresh, incompatible, retired, and corrupt manifests', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'ywtc-inventory-'));
    await SourceInventoryStore.open(options(directory));
    const firstGeneration = (await manifest(directory)).generation;

    const incompatible = await SourceInventoryStore.open(options(directory, {scope: 'page'}));
    expect(incompatible.reused).toBe(false);
    expect((await manifest(directory)).generation).not.toBe(firstGeneration);

    const freshGeneration = (await manifest(directory)).generation;
    const fresh = await SourceInventoryStore.open(options(directory, {scope: 'page', fresh: true}));
    expect(fresh.reused).toBe(false);
    expect((await manifest(directory)).generation).not.toBe(freshGeneration);

    await fresh.retire();
    const afterRetire = await SourceInventoryStore.open(options(directory, {scope: 'page'}));
    expect(afterRetire.reused).toBe(false);

    await writeFile(path.join(directory, 'inventory', stateId, 'manifest.json'), '{broken', {mode: 0o600});
    const afterCorruption = await SourceInventoryStore.open(options(directory, {scope: 'page'}));
    expect(afterCorruption.reused).toBe(false);
  });

  it('rejects an unsafe state identity before creating paths', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'ywtc-inventory-'));
    await expect(SourceInventoryStore.open(options(directory, {stateId: '../outside'}))).rejects.toThrow(/invalid source inventory state identity/i);
  });
});

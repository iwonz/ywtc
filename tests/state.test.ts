import {mkdtemp, readFile, stat, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {resolveStateLocation, StateStore, transferStateId, type TransferIdentity} from '../src/state.js';

const identity: TransferIdentity = {
  source: {profile: 'wiki', provider: 'yandex-wiki', instance: 'https://wiki.example.com/', objectId: '10'},
  destination: {profile: 'conf', provider: 'confluence', instance: 'https://conf.example.com/confluence/', objectId: '20', containerId: 'DOC'},
};

describe('transfer state', () => {
  it('builds an unversioned canonical ID and isolates destinations and export formats', () => {
    expect(transferStateId(identity)).toBe(transferStateId({...identity}));
    expect(transferStateId(identity)).toBe(transferStateId({
      ...identity,
      source: {...identity.source, instance: 'https://wiki.example.com'},
    }));
    expect(transferStateId(identity)).not.toBe(transferStateId({
      ...identity,
      destination: {profile: 'conf', provider: 'confluence', instance: 'https://conf.example.com/confluence/', objectId: '21', containerId: 'DOC'},
    }));
    const markdown: TransferIdentity = {...identity, destination: {provider: 'filesystem', path: '/tmp/export', format: 'markdown'}};
    const html: TransferIdentity = {...identity, destination: {provider: 'filesystem', path: '/tmp/export', format: 'html'}};
    expect(transferStateId(markdown)).not.toBe(transferStateId(html));
    expect(resolveStateLocation(identity, {runtimeDirectory: '/tmp/states'}).filename).toContain(transferStateId(identity));
    // Source selection changes expand or narrow the same canonical transfer state.
    expect(transferStateId(identity)).toBe(transferStateId(identity));
  });

  it('checkpoints unversioned runs and pages atomically and marks abandoned runs interrupted', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'ywtc-state-'));
    const filename = path.join(directory, 'state.json');
    const store = new StateStore(filename);
    await store.load(identity);
    const run = await store.beginRun('linked', false, 'current');
    await store.setRunSelection(run.id, {
      requestedStatus: 'current', effectiveStatus: 'current', returnedDescendants: 9, selectedDescendants: 2,
      excluded: [{id: '11', locator: 'root/obsolete', reason: 'source-status', status: 'obsolete'}],
      maximumDepth: 2, hierarchyGaps: [], notes: [],
    });
    await store.setPage({
      sourceId: '10', sourceCanonicalId: 'wiki:10', sourceLocator: 'root', sourceTitle: 'Root',
      destinationTitle: 'Root', status: 'discovered', resources: {}, degradations: [], updatedAt: new Date().toISOString(),
    });
    const persisted = JSON.parse(await readFile(filename, 'utf8')) as Record<string, unknown>;
    expect(persisted).not.toHaveProperty('version');
    const resumed = new StateStore(filename);
    const state = await resumed.load(identity);
    expect(state.runs.find((item) => item.id === run.id)?.status).toBe('interrupted');
    expect(state.runs.find((item) => item.id === run.id)).toMatchObject({sourceStatus: 'current', returnedDescendants: 9, selectedDescendants: 2, excludedPages: 1, maximumDepth: 2});
    expect(state.pages['wiki:10']?.status).toBe('discovered');
  });

  it('strictly rejects an unknown field with a generic error and preserves the file', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'ywtc-state-invalid-'));
    const filename = path.join(directory, 'state.json');
    const original = '{"version":2,"pages":{}}\n';
    await writeFile(filename, original);
    await expect(new StateStore(filename).load(identity)).rejects.toThrow(/is invalid/);
    await expect(new StateStore(filename).load(identity)).rejects.not.toThrow(/schema v[12]/);
    await expect(readFile(filename, 'utf8')).resolves.toBe(original);
  });

  it('preserves an existing selected file as a backup for a fresh live run', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'ywtc-state-fresh-'));
    const filename = path.join(directory, 'state.json');
    await writeFile(filename, 'unrecognized state\n');
    const store = new StateStore(filename);
    const state = await store.load(identity, {fresh: true});
    expect(state.pages).toEqual({});
    expect(store.loadInfo.source).toBe('fresh');
    expect(store.loadInfo.backupFilename).toBeDefined();
    await expect(stat(store.loadInfo.backupFilename!)).resolves.toMatchObject({});
  });

  it('does not move or create state for a fresh dry-run', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'ywtc-state-dry-'));
    const filename = path.join(directory, 'state.json');
    await writeFile(filename, 'keep\n');
    const store = new StateStore(filename);
    await store.load(identity, {fresh: true, dryRun: true});
    await expect(readFile(filename, 'utf8')).resolves.toBe('keep\n');
    expect(store.loadInfo.backupFilename).toBeUndefined();
  });
});

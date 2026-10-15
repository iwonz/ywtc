import {mkdtemp, readFile, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {resolveStateLocation, StateStore, transferStateId, type TransferIdentity} from '../src/state.js';

const identity: TransferIdentity = {
  source: {profile: 'wiki', provider: 'yandex-wiki', instance: 'https://wiki.example.com/', objectId: '10'},
  destination: {profile: 'conf', provider: 'confluence', instance: 'https://conf.example.com/confluence/', objectId: '20', containerId: 'DOC'},
};

describe('state schema v2', () => {
  it('builds a locator-independent canonical ID and isolates destinations', () => {
    expect(transferStateId(identity)).toBe(transferStateId({...identity}));
    expect(transferStateId(identity)).not.toBe(transferStateId({
      ...identity,
      destination: {profile: 'conf', provider: 'confluence', instance: 'https://conf.example.com/confluence/', objectId: '21', containerId: 'DOC'},
    }));
    expect(resolveStateLocation(identity, {runtimeDirectory: '/tmp/states'}).filename).toContain(transferStateId(identity));
  });

  it('checkpoints runs/pages atomically and marks abandoned runs interrupted', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'ywtc-state-v2-'));
    const filename = path.join(directory, 'state.json');
    const store = new StateStore(filename);
    await store.load(identity);
    const run = await store.beginRun('linked', false);
    await store.setPage({
      sourceId: '10', sourceCanonicalId: 'wiki:10', sourceLocator: 'root', sourceTitle: 'Root',
      destinationTitle: 'Root', status: 'discovered', resources: {}, degradations: [], updatedAt: new Date().toISOString(),
    });
    const resumed = new StateStore(filename);
    const state = await resumed.load(identity);
    expect(state.runs.find((item) => item.id === run.id)?.status).toBe('interrupted');
    expect(state.pages['wiki:10']?.status).toBe('discovered');
  });

  it('rejects v1 without modifying it', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'ywtc-state-v1-'));
    const filename = path.join(directory, 'state.json');
    const original = '{"version":1,"pages":{}}\n';
    await writeFile(filename, original);
    await expect(new StateStore(filename).load(identity)).rejects.toThrow(/schema v1/);
    await expect(readFile(filename, 'utf8')).resolves.toBe(original);
  });
});

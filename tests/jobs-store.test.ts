import {mkdtemp, readFile, stat, symlink} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

const load = () => import('../src/jobs/store.js');
const request = {kind: 'scan', source: 'start', scope: 'subtree', sourceStatus: 'all', comments: true, kinds: ['mentions', 'hashtags']};

describe('private durable job evidence', () => {
  it('provides a durable job store', async () => {
    await expect(load()).resolves.toHaveProperty('JobStore');
  });
  it('publishes immutable non-secret requests and reconciled lifecycle evidence', async () => {
    const {JobStore} = await load(), root = await mkdtemp(path.join(os.tmpdir(), 'ywtc-jobs-'));
    const store = new JobStore(root), job = await store.create(request);
    expect(job.status).toBe('queued');
    expect(job.runId).toBeUndefined();
    expect((await stat(store.filename(job.id))).mode & 0o777).toBe(0o600);
    expect((await store.get(job.id)).request).toEqual(request);
    await store.transition(job.id, 'running', {pid: process.pid, nonce: 'worker-identity'});
    await expect(store.transition(job.id, 'queued')).rejects.toThrow(/transition/);
    await store.transition(job.id, 'interrupted', {error: 'worker disappeared'});
    expect((await store.get(job.id)).status).toBe('interrupted');
    expect(await store.list()).toHaveLength(1);
    expect(await store.list({activeOnly: true})).toHaveLength(0);
    await expect(store.create({...request, token: 'should-never-be-persisted'})).rejects.toThrow();
    expect(await readFile(store.filename(job.id), 'utf8')).not.toContain('should-never-be-persisted');
  });
  it('replays ordered bounded events and resets a missing cursor to a snapshot', async () => {
    const {JobStore} = await load(), root = await mkdtemp(path.join(os.tmpdir(), 'ywtc-replay-'));
    const store = new JobStore(root), job = await store.create(request);
    await store.append(job.id, {type: 'message', message: 'first'});
    await store.append(job.id, {type: 'message', message: 'second'});
    const replay = await store.events(job.id, 1, 1);
    expect(replay.events).toHaveLength(1);
    expect(replay.events[0]).toMatchObject({sequence: 2, message: 'second', jobId: job.id});
    expect((await store.events(job.id, 900)).reset).toBe(true);
    await expect(store.get('../config')).rejects.toThrow(/ID/);
    const outside = await mkdtemp(path.join(os.tmpdir(), 'ywtc-outside-'));
    const linked = '11111111-1111-4111-8111-111111111111';
    await symlink(outside, path.dirname(store.filename(linked)));
    await expect(store.get(linked)).rejects.toThrow(/symlink|boundary/);
  });
  it('serializes concurrent event writers in one store', async () => {
    const {JobStore} = await load(), store = new JobStore(await mkdtemp(path.join(os.tmpdir(), 'ywtc-order-')));
    const job = await store.create(request);
    await Promise.all(Array.from({length: 12}, (_, index) => store.append(job.id, {type: 'message', message: String(index)})));
    expect((await store.events(job.id)).events.map(event => event.sequence)).toEqual(Array.from({length: 12}, (_, index) => index + 1));
  });
  it('rejects a symlinked runtime ancestor before reading evidence', async () => {
    const {JobStore} = await load(), outside = await mkdtemp(path.join(os.tmpdir(), 'ywtc-job-out-'));
    const job = await new JobStore(outside).create(request);
    const root = await mkdtemp(path.join(os.tmpdir(), 'ywtc-job-in-'));
    await symlink(path.join(outside, '.states'), path.join(root, '.states'));
    await expect(new JobStore(root).get(job.id)).rejects.toThrow(/symlink|boundary/);
    await expect(new JobStore(root).create(request)).rejects.toThrow(/symlink|boundary/);
  });
  it('serializes writers from independent clients and rejects stale lifecycle claims', async () => {
    const {JobStore} = await load(), root = await mkdtemp(path.join(os.tmpdir(), 'ywtc-multi-'));
    const first = new JobStore(root), second = new JobStore(root), job = await first.create(request);
    await Promise.all([first.append(job.id, {type: 'message', message: 'a'}), second.append(job.id, {type: 'message', message: 'b'})]);
    expect((await first.get(job.id)).lastSequence).toBe(2);
    await first.transition(job.id, 'running', {}, 'queued');
    await expect(second.transition(job.id, 'finished', {}, 'queued')).rejects.toThrow(/changed/);
  });
  it('recovers a durable append before checkpoint and discards an unfinished tail', async () => {
    const {appendFile, writeFile} = await import('node:fs/promises');
    const {JobStore} = await load(), root = await mkdtemp(path.join(os.tmpdir(), 'ywtc-journal-'));
    const store = new JobStore(root), job = await store.create(request);
    await store.append(job.id, {type: 'message', message: 'durable'});
    const journal = path.join(path.dirname(store.filename(job.id)), 'events.ndjson');
    await writeFile(store.filename(job.id), JSON.stringify(job));
    await appendFile(journal, '{"unfinished":');
    const next = await store.append(job.id, {type: 'message', message: 'continued'});
    expect(next.sequence).toBe(2);expect((await store.events(job.id)).events.map(e => e.message)).toEqual(['durable', 'continued']);
  });
});

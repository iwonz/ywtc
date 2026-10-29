import {mkdtemp, readFile, writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {JobStore} from '../src/jobs/store.js';
import {resolveWorkspace} from '../src/workspace.js';

async function localFixture(delay = 500) {
  const requests: string[] = [];
  const server = createServer((request, response) => {
    requests.push(new URL(request.url!, 'http://example.test').searchParams.get('slug') ?? '');
    setTimeout(() => {response.setHeader('Content-Type', 'application/json');response.end(JSON.stringify({id: 1, slug: 'a', title: 'A', page_type: 'page', content: 'Hello @ivan #tag'}));}, delay);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();if (!address || typeof address === 'string') throw Error('fixture bind failed');
  const root = await mkdtemp(path.join(os.tmpdir(), 'ywtc-queue-'));
  await writeFile(path.join(root, 'ywtc.config.yaml'), JSON.stringify({connections: {wiki: {type: 'yandex-wiki', apiUrl: `http://127.0.0.1:${address.port}`, webUrl: 'https://wiki.example.com', token: 'fixture-token', organization: {id: '1'}}}, defaults: {timeoutMs: 10000}}));
  return {root, workspace: await resolveWorkspace({explicit: root}), requests, close: async () => {server.closeAllConnections();await new Promise<void>(resolve => server.close(() => resolve()));}};
}
const scan = {kind: 'scan', source: 'a', scope: 'page', sourceStatus: 'all', comments: false, kinds: ['mentions']};
async function until(check: () => boolean | Promise<boolean>) {for (let i = 0; i < 200; i++) {if (await check()) return;await new Promise(resolve => setTimeout(resolve, 25));}throw Error('fixture wait timed out');}

describe('detached workspace job execution', () => {
  it('runs queued operations FIFO without keeping the submitter attached', async () => {
    const {submitJob, waitForJob} = await import('../src/jobs/client.js'), fixture = await localFixture();
    try {
      const first = await submitJob(fixture.workspace, scan);
      const second = await submitJob(fixture.workspace, {...scan, source: 'b'});
      expect((await new JobStore(fixture.root).get(second.id)).status).toBe('queued');
      const one = await waitForJob(fixture.workspace, first.id), two = await waitForJob(fixture.workspace, second.id);
      expect(one.result?.status).toBe('completed');expect(two.result?.status).toBe('completed');
      expect(fixture.requests).toEqual(['a', 'b']);
    } finally {await fixture.close();}
  }, 15000);
  it('cancels a running operation through verified job control', async () => {
    const {submitJob, stopJob, waitForJob} = await import('../src/jobs/client.js'), fixture = await localFixture(1000);
    try {
      const job = await submitJob(fixture.workspace, scan);await until(() => fixture.requests.length > 0);
      const stopping = await stopJob(fixture.workspace, job.id);expect(['stopping', 'finished']).toContain(stopping.status);
      const result = await waitForJob(fixture.workspace, job.id);expect(result.result).toMatchObject({status: 'cancelled', exitCode: 130});
    } finally {await fixture.close();}
  }, 15000);
  it('records a crashed owned fixture worker as interrupted without retrying it', async () => {
    const {submitJob, waitForJob} = await import('../src/jobs/client.js'), fixture = await localFixture(1000);
    try {
      const job = await submitJob(fixture.workspace, scan);await until(() => fixture.requests.length > 0);
      const owned = await new JobStore(fixture.root).get(job.id);expect(owned.nonce).toBeTruthy();expect(owned.pid).toBeGreaterThan(0);
      process.kill(owned.pid!, 'SIGKILL');
      const result = await waitForJob(fixture.workspace, job.id);expect(result.status).toBe('interrupted');
      await new Promise(resolve => setTimeout(resolve, 300));expect(fixture.requests).toHaveLength(1);
    } finally {await fixture.close();}
  }, 15000);
  it('executes source-only work after submission and records final evidence', async () => {
    const {submitJob, waitForJob} = await import('../src/jobs/client.js');
    const root = await mkdtemp(path.join(os.tmpdir(), 'ywtc-worker-'));
    // Deterministic failure before a provider request: no runtime credentials or real endpoints.
    await writeFile(path.join(root, 'ywtc.config.yaml'), JSON.stringify({connections: {wiki: {type: 'yandex-wiki', apiUrl: 'http://127.0.0.1:1', webUrl: 'https://wiki.example.com', token: 'fixture-token', organization: {id: '1'}}}, defaults: {timeoutMs: 1000}}));
    const workspace = await resolveWorkspace({explicit: root});
    const job = await submitJob(workspace, {kind: 'scan', source: 'a', scope: 'page', sourceStatus: 'all', comments: false, kinds: ['mentions']});
    expect(job.id).toMatch(/^[a-f0-9-]{36}$/);
    const result = await waitForJob(workspace, job.id);
    expect(result.status).toBe('finished');expect(result.result?.exitCode).toBe(1);
    expect((await new JobStore(root).events(job.id)).events.length).toBeGreaterThan(0);
    expect(await readFile(new JobStore(root).filename(job.id), 'utf8')).not.toContain('fixture-token');
  }, 25_000);
});

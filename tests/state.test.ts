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
    const run = await store.beginRun('linked', false, 'current', true, {
      retryRootRunId: '11111111-1111-4111-8111-111111111111',
      retryParentRunId: '22222222-2222-4222-8222-222222222222',
      retryAttempt: 2,
      retrySelectedPages: 3,
      retrySelectedResources: 1,
      retrySelectedComments: 2,
      retryContextPages: 4,
    });
    await store.setRunComments(run.id, {threads: 1, comments: 2, attachments: 1});
    await store.setRunMentions(run.id, {
      mode: 'auto', pageMentions: 2, commentMentions: 1,
      mentionIdentities: 2,
      outcomes: {total: 3, preserved: 0, native: 1, linked: 1, text: 0, unresolved: 1, failed: 0},
    });
    await store.setRunSelection(run.id, {
      requestedStatus: 'current', effectiveStatus: 'current', returnedDescendants: 9, selectedDescendants: 2,
      excluded: [{id: '11', locator: 'root/obsolete', reason: 'source-status', status: 'obsolete'}],
      maximumDepth: 2, hierarchyGaps: [], notes: [],
    });
    await store.setPage({
      sourceId: '10', sourceCanonicalId: 'wiki:10', sourceLocator: 'root', sourceTitle: 'Root',
      destinationTitle: 'Root', destinationFingerprint: 'page-fingerprint', destinationVersion: '8', status: 'discovered', resources: {}, degradations: [],
      comments: {
        fingerprint: 'comments-fingerprint', destinationId: 'comment-1', destinationFingerprint: 'comment-fingerprint', destinationVersion: '3', archiveResourceId: 'archive-1',
        archiveName: 'comments.zip', archiveSha256: 'archive-hash', status: 'complete', threads: 1,
        comments: 2, participants: 2, attachments: 1, bytes: 42, updatedAt: new Date().toISOString(),
      },
      mentions: {
        policyFingerprint: 'f'.repeat(64),
        outcomes: {total: 2, preserved: 0, native: 1, linked: 0, text: 0, unresolved: 1, failed: 0},
        updatedAt: new Date().toISOString(),
      },
      updatedAt: new Date().toISOString(),
    });
    await store.setPage({
      sourceId: '11', sourceCanonicalId: 'wiki:11', sourceLocator: 'root/child', sourceTitle: 'Child',
      projectedParentId: 'wiki:10', destinationTitle: 'Child', status: 'blocked',
      blockedByPageId: 'wiki:10', blockedByCode: 'destination-page-staging-failed', blockedReason: 'parent unavailable',
      resources: {
        attachment: {
          sourceId: 'attachment', sourceName: 'file.pdf', destinationName: 'file.pdf', status: 'blocked',
          blockedByPageId: 'wiki:10', blockedByCode: 'destination-page-staging-failed', blockedReason: 'parent unavailable',
          updatedAt: new Date().toISOString(),
        },
      },
      comments: {
        status: 'not-started', threads: 0, comments: 0, participants: 0, attachments: 0, bytes: 0,
        updatedAt: new Date().toISOString(),
      },
      degradations: [], updatedAt: new Date().toISOString(),
    });
    const persisted = JSON.parse(await readFile(filename, 'utf8')) as Record<string, unknown>;
    expect(persisted).not.toHaveProperty('version');
    await store.release();
    const resumed = new StateStore(filename);
    const state = await resumed.load(identity);
    expect(state.runs.find((item) => item.id === run.id)?.status).toBe('interrupted');
    expect(state.runs.find((item) => item.id === run.id)).toMatchObject({
      operation: 'retry', sourceStatus: 'current', returnedDescendants: 9, selectedDescendants: 2,
      excludedPages: 1, maximumDepth: 2, commentsEnabled: true, commentThreads: 1, comments: 2,
      commentAttachments: 1, retryAttempt: 2, retrySelectedPages: 3, retrySelectedResources: 1,
      retrySelectedComments: 2, retryContextPages: 4, mentionMode: 'auto', pageMentions: 2,
      commentMentions: 1, mentionIdentities: 2, mentionOutcomes: {total: 3, native: 1, linked: 1, unresolved: 1},
    });
    expect(state.pages['wiki:10']).toMatchObject({status: 'discovered', destinationFingerprint: 'page-fingerprint', destinationVersion: '8'});
    expect(state.pages['wiki:10']?.comments).toMatchObject({status: 'complete', destinationId: 'comment-1', destinationVersion: '3', comments: 2});
    expect(state.pages['wiki:10']?.mentions).toMatchObject({policyFingerprint: 'f'.repeat(64), outcomes: {total: 2, native: 1, unresolved: 1}});
    expect(state.pages['wiki:11']).toMatchObject({
      status: 'blocked', blockedByPageId: 'wiki:10',
      resources: {attachment: {status: 'blocked', blockedByCode: 'destination-page-staging-failed'}},
      comments: {status: 'not-started'},
    });
    await resumed.release();
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

  it('removes planned outcomes from a terminal live run while preserving dry-run plans', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'ywtc-state-outcomes-'));
    const store = new StateStore(path.join(directory, 'state.json'));
    await store.load(identity);
    await store.setPage({
      sourceId: '10', sourceCanonicalId: 'wiki:10', sourceLocator: 'root', sourceTitle: 'Root',
      destinationTitle: 'Root', status: 'failed', lastError: 'create failed', resources: {
        file: {sourceId: 'file', sourceName: 'file.pdf', destinationName: 'file.pdf', status: 'planned', updatedAt: new Date().toISOString()},
      },
      comments: {status: 'planned', threads: 1, comments: 1, participants: 1, attachments: 0, bytes: 0, updatedAt: new Date().toISOString()},
      degradations: [], updatedAt: new Date().toISOString(),
    });
    await store.finalizeOutcomes(['wiki:10'], 'partial', false);
    expect(store.value.pages['wiki:10']).toMatchObject({
      resources: {file: {status: 'blocked', blockedByPageId: 'wiki:10'}},
      comments: {status: 'blocked', blockedByPageId: 'wiki:10'},
    });
    await store.release();
  });

  it('rejects a concurrent live state owner and recovers a provably stale lock', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'ywtc-state-lock-'));
    const filename = path.join(directory, 'state.json');
    const active = new StateStore(filename);
    await active.load(identity);
    await expect(new StateStore(filename).load(identity)).rejects.toThrow(/Another ywtc state run is active/);
    await active.release();

    await writeFile(`${filename}.lock`, `${JSON.stringify({
      pid: 999_999_999,
      hostname: os.hostname(),
      startedAt: new Date().toISOString(),
      purpose: 'ywtc state run',
      target: filename,
    })}\n`);
    const recovered = new StateStore(filename);
    await expect(recovered.load(identity)).resolves.toMatchObject({identity});
    await recovered.release();
  });
});

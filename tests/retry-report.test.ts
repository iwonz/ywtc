import {mkdir, mkdtemp, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {resolveRetryBaseline} from '../src/retry-report.js';

const rootRun = '11111111-1111-4111-8111-111111111111';
const retryRun = '22222222-2222-4222-8222-222222222222';

function report(runId: string, statePath: string, input: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    runId,
    startedAt: runId === rootRun ? '2026-10-21T10:00:00.000Z' : '2026-10-21T11:00:00.000Z',
    finishedAt: runId === rootRun ? '2026-10-21T10:05:00.000Z' : '2026-10-21T11:05:00.000Z',
    status: 'partial',
    dryRun: false,
    commentsEnabled: true,
    scope: 'subtree',
    sourceStatus: 'all',
    direction: 'yandex-wiki → confluence',
    source: {provider: 'yandex-wiki', profile: 'wiki', rootId: 'root', title: 'Root', url: 'https://wiki.example.com/root'},
    destination: {provider: 'confluence', profile: 'docs', id: '100', url: 'https://conf.example.com/pages/100'},
    state: {id: 'state', path: statePath, mode: 'automatic', source: 'existing'},
    pages: [],
    excludedPages: [],
    edges: [],
    hierarchyRepairs: [],
    warnings: [],
    errors: [],
    issues: [],
    outputs: [],
    summary: {inventoryComplete: true, inventoryRemainingFailures: 0, complete: 0, partial: 0, failed: 0, blocked: 0, conflicts: 0, notStartedPages: 0},
    ...input,
  };
}

async function workspace(): Promise<{root: string; reports: string; state: string}> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ywtc-retry-report-'));
  const reports = path.join(root, '.states', 'reports');
  const state = path.join(root, '.states', 'state.json');
  await mkdir(reports, {recursive: true});
  await writeFile(state, '{}\n');
  return {root, reports, state};
}

async function writeReport(reports: string, runId: string, value: Record<string, unknown>): Promise<void> {
  const directory = path.join(reports, runId);
  await mkdir(directory, {recursive: true});
  await writeFile(path.join(directory, 'report.json'), `${JSON.stringify(value)}\n`);
}

describe('retry report lineage', () => {
  it('reconstructs current pre-retry reports and follows the newest live result in a lineage', async () => {
    const target = await workspace();
    await writeReport(target.reports, rootRun, report(rootRun, target.state));
    await writeReport(target.reports, retryRun, report(retryRun, target.state, {
      retry: {
        rootRunId: rootRun,
        parentRunId: rootRun,
        attempt: 1,
        selectedPages: 2,
        selectedResources: 1,
        selectedComments: 0,
        contextPages: 1,
        carriedForward: 5,
        remainingRetryable: 1,
        remainingTerminal: 0,
        preview: false,
      },
    }));
    const baseline = await resolveRetryBaseline(target.reports, rootRun, target.root);
    expect(baseline.rootRunId).toBe(rootRun);
    expect(baseline.baseline.runId).toBe(retryRun);
    expect(baseline.attempt).toBe(2);
    expect(baseline.invocation).toEqual({
      source: {locator: 'https://wiki.example.com/root', profile: 'wiki'},
      destination: {type: 'remote', locator: 'https://conf.example.com/pages/100', profile: 'docs'},
      scope: 'subtree',
      sourceStatus: 'all',
      comments: true,
      archive: false,
      state: {mode: 'automatic', path: target.state},
    });
  });

  it('uses an explicit safe invocation snapshot for filesystem exports', async () => {
    const target = await workspace();
    const exportPath = path.join(target.root, 'export');
    await writeReport(target.reports, rootRun, report(rootRun, target.state, {
      destination: {provider: 'filesystem', id: exportPath, format: 'html'},
      state: {id: 'state', path: target.state, mode: 'explicit', source: 'existing'},
      invocation: {
        source: {locator: 'root', profile: 'wiki'},
        destination: {type: 'directory', path: exportPath, format: 'html'},
        scope: 'linked',
        sourceStatus: 'current',
        comments: false,
        archive: true,
        state: {mode: 'explicit', path: target.state},
      },
    }));
    const baseline = await resolveRetryBaseline(target.reports, rootRun, target.root);
    expect(baseline.invocation.destination).toEqual({type: 'directory', path: exportPath, format: 'html'});
    expect(baseline.invocation).toMatchObject({scope: 'linked', sourceStatus: 'current', comments: false, archive: true});
  });

  it('rejects a legacy filesystem report when its archive policy cannot be proven', async () => {
    const target = await workspace();
    const exportPath = path.join(target.root, 'export');
    await writeReport(target.reports, rootRun, report(rootRun, target.state, {
      destination: {provider: 'filesystem', id: exportPath, format: 'html'},
    }));
    await expect(resolveRetryBaseline(target.reports, rootRun, target.root)).rejects.toThrow(/archive-policy evidence/);
  });

  it('rejects dry-runs, malformed IDs, missing state, and state paths outside the workspace', async () => {
    const target = await workspace();
    await writeReport(target.reports, rootRun, report(rootRun, target.state, {dryRun: true}));
    await expect(resolveRetryBaseline(target.reports, rootRun, target.root)).rejects.toThrow(/dry-run/);
    await expect(resolveRetryBaseline(target.reports, 'last', target.root)).rejects.toThrow(/canonical UUID/);

    const missingRun = '33333333-3333-4333-8333-333333333333';
    await writeReport(target.reports, missingRun, report(missingRun, path.join(target.root, '.states', 'missing.json')));
    await expect(resolveRetryBaseline(target.reports, missingRun, target.root)).rejects.toThrow(/state is missing/);

    const outsideRun = '44444444-4444-4444-8444-444444444444';
    await writeReport(target.reports, outsideRun, report(outsideRun, path.join(os.tmpdir(), 'outside-state.json')));
    await expect(resolveRetryBaseline(target.reports, outsideRun, target.root)).rejects.toThrow(/outside the selected workspace/);
  });

  it('rejects invocation evidence that does not match the report profiles and state', async () => {
    const target = await workspace();
    await writeReport(target.reports, rootRun, report(rootRun, target.state, {
      invocation: {
        source: {locator: 'root', profile: 'another-wiki'},
        destination: {type: 'remote', locator: '100', profile: 'docs'},
        scope: 'subtree', sourceStatus: 'all', comments: true, archive: false,
        state: {mode: 'automatic', path: target.state},
      },
    }));
    await expect(resolveRetryBaseline(target.reports, rootRun, target.root)).rejects.toThrow(/inconsistent invocation/);
  });
});

import {mkdtemp, readFile, stat, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {initializeWorkspace, resolveWorkspace, validateWorkspaceMarker} from '../src/workspace.js';

describe('workspace schema v2', () => {
  it('creates profiles, credentials, state/cache/report folders and preserves files', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ywtc-workspace-v2-'));
    const workspace = await resolveWorkspace({explicit: root});
    const first = await initializeWorkspace(workspace);
    expect(first.created).toContain(workspace.configFile);
    await writeFile(workspace.envFile, 'KEEP=1\n');
    const second = await initializeWorkspace(workspace);
    expect(second.existing).toContain(workspace.envFile);
    await expect(readFile(workspace.envFile, 'utf8')).resolves.toBe('KEEP=1\n');
    await expect(stat(workspace.cacheDirectory)).resolves.toMatchObject({});
    await expect(validateWorkspaceMarker(workspace)).resolves.toBeUndefined();
  });

  it('rejects a legacy marker with migration guidance', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ywtc-workspace-v1-'));
    const workspace = await resolveWorkspace({explicit: root});
    await initializeWorkspace(workspace);
    await writeFile(workspace.marker, '{"schemaVersion":1,"tool":"ywtc"}');
    await expect(validateWorkspaceMarker(workspace)).rejects.toThrow(/schema v1/);
  });
});

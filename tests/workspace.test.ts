import {chmod, mkdtemp, readFile, stat, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {
  initializeWorkspace,
  resolveWorkspace,
  resolveWorkspacePath,
  validateWorkspaceMarker,
  WORKSPACE_MARKER,
} from '../src/workspace.js';

describe('workspace', () => {
  it('applies explicit, marked current, and home precedence', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ywtc-workspace-'));
    const cwd = path.join(root, 'cwd');
    const home = path.join(root, 'home');
    const explicit = await resolveWorkspace({explicit: '~/explicit', cwd, homeDirectory: home});
    expect(explicit.root).toBe(path.join(home, 'explicit'));
    const fallback = await resolveWorkspace({cwd, homeDirectory: home});
    expect(fallback.root).toBe(path.join(home, '.ywtc'));
    const current = {...fallback, root: cwd, marker: path.join(cwd, WORKSPACE_MARKER), envFile: path.join(cwd, '.env'), statesDirectory: path.join(cwd, '.states')};
    await initializeWorkspace(current);
    await expect(resolveWorkspace({cwd, homeDirectory: home})).resolves.toMatchObject({root: cwd, source: 'current'});
  });

  it('initializes idempotently and preserves existing configuration', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ywtc-init-'));
    const workspace = await resolveWorkspace({explicit: path.join(root, 'work')});
    const first = await initializeWorkspace(workspace);
    expect(first.created).toHaveLength(3);
    await writeFile(workspace.envFile, 'CUSTOM=yes\n', 'utf8');
    const second = await initializeWorkspace(workspace);
    expect(second.existing).toHaveLength(3);
    await expect(readFile(workspace.envFile, 'utf8')).resolves.toBe('CUSTOM=yes\n');
    await expect(validateWorkspaceMarker(workspace)).resolves.toBeUndefined();
    if (process.platform !== 'win32') expect((await stat(workspace.envFile)).mode & 0o777).toBe(0o600);
    await chmod(workspace.envFile, 0o600);
  });

  it('keeps relative and absolute runtime paths inside the workdir', async () => {
    const workspace = await resolveWorkspace({explicit: '/tmp/ywtc-safe'});
    expect(resolveWorkspacePath(workspace, '.states/a.json')).toBe('/tmp/ywtc-safe/.states/a.json');
    expect(() => resolveWorkspacePath(workspace, '../outside.json')).toThrow(/inside workdir/);
    expect(() => resolveWorkspacePath(workspace, '/tmp/outside.json')).toThrow(/inside workdir/);
  });
});

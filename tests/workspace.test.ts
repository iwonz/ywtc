import {access, chmod, mkdir, mkdtemp, readFile, stat, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {initializeWorkspace, resolveInitWorkspace, resolveWorkspace} from '../src/workspace.js';

describe('config-only workspace', () => {
  it('creates only config and runtime directories, then preserves existing data and permissions', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ywtc-workspace-'));
    const workspace = await resolveWorkspace({explicit: root});
    const first = await initializeWorkspace(workspace);
    expect(first.created).toContain(workspace.configFile);
    expect((await stat(workspace.configFile)).mode & 0o777).toBe(0o600);
    await writeFile(workspace.configFile, 'KEEP: true\n');
    await chmod(workspace.configFile, 0o644);
    const second = await initializeWorkspace(workspace);
    expect(second.existing).toContain(workspace.configFile);
    await expect(readFile(workspace.configFile, 'utf8')).resolves.toBe('KEEP: true\n');
    expect((await stat(workspace.configFile)).mode & 0o777).toBe(0o644);
    await expect(stat(workspace.cacheDirectory)).resolves.toMatchObject({});
    await expect(stat(workspace.reportsDirectory)).resolves.toMatchObject({});
    await expect(access(path.join(root, '.env'))).rejects.toMatchObject({code: 'ENOENT'});
    await expect(access(path.join(root, '.ywtc-workspace.json'))).rejects.toMatchObject({code: 'ENOENT'});
  });

  it('selects explicit, exact current, and default workdirs without searching ancestors', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ywtc-workspace-resolution-'));
    const home = path.join(root, 'home');
    const configured = path.join(root, 'configured');
    const child = path.join(configured, 'child');
    const explicit = path.join(root, 'explicit');
    await mkdir(child, {recursive: true});
    await writeFile(path.join(configured, 'ywtc.config.yaml'), 'connections: {}\n');

    await expect(resolveWorkspace({explicit, cwd: child, homeDirectory: home})).resolves.toMatchObject({root: explicit, source: 'explicit'});
    await expect(resolveWorkspace({cwd: configured, homeDirectory: home})).resolves.toMatchObject({root: configured, source: 'current'});
    await expect(resolveWorkspace({cwd: child, homeDirectory: home})).resolves.toMatchObject({root: path.join(home, '.ywtc'), source: 'default'});
  });

  it('initializes the default home workspace even when CWD has a configuration', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ywtc-workspace-init-'));
    const home = path.join(root, 'home');
    await writeFile(path.join(root, 'ywtc.config.yaml'), 'connections: {}\n');
    const workspace = resolveInitWorkspace({cwd: root, homeDirectory: home});
    expect(workspace).toMatchObject({root: path.join(home, '.ywtc'), source: 'default'});
    await initializeWorkspace(workspace);
    await expect(stat(path.join(home, '.ywtc', 'ywtc.config.yaml'))).resolves.toMatchObject({});
  });
});

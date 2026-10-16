import * as fs from 'node:fs/promises';
import type {PathLike} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {
  commitInteractiveConfig,
  createInteractiveConfigDocument,
  defaultConfluenceProfile,
  defaultYandexProfile,
  InteractiveConfigConflictError,
  readExistingInteractiveConfig,
  updateInteractiveProfile,
  validateInteractiveDocument,
} from '../src/interactive-config.js';
import {resolveInitWorkspace} from '../src/workspace.js';

const existingYaml = `# workspace comment
defaults:
  timeoutMs: 45000
  concurrency: 3
connections:
  wiki-main: # selected connection
    type: yandex-wiki
    apiUrl: https://api.wiki.yandex.net/v1
    webUrl: https://wiki.example.com
    authType: oauth
    token: old-wiki-token
    organization: { type: yandex360, id: org-1 }
    limits:
      readConcurrency: 7
      burst: 11
  keep-cloud:
    type: confluence
    deployment: cloud
    baseUrl: https://tenant.atlassian.net
    authType: api-token
    token: untouched-token
    email: untouched@example.com
`;

function completeDocument() {
  const document = createInteractiveConfigDocument();
  const yandex = defaultYandexProfile();
  yandex.token = 'wiki-token';
  yandex.organization.id = 'org-1';
  const confluence = defaultConfluenceProfile();
  confluence.baseUrl = 'https://confluence.example.com/confluence';
  confluence.token = 'conf-token';
  updateInteractiveProfile(document, undefined, yandex);
  updateInteractiveProfile(document, undefined, confluence);
  return document;
}

describe('interactive configuration', () => {
  it('uses strict in-memory parsing while preserving unselected profiles, comments, defaults, and limits', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ywtc-interactive-edit-'));
    const workspace = resolveInitWorkspace({explicit: root});
    await fs.writeFile(workspace.configFile, existingYaml, {mode: 0o640});
    const existing = await readExistingInteractiveConfig(workspace);
    expect(existing?.config?.timeoutMs).toBe(45_000);
    const document = existing!.document!.clone();
    const selected = existing!.config!.profiles['wiki-main'];
    if (selected?.type !== 'yandex-wiki') throw new Error('expected Yandex profile');
    updateInteractiveProfile(document, selected.name, {...selected, token: 'new-wiki-token', webUrl: 'https://wiki.changed.example'});

    const output = document.toString();
    const parsed = validateInteractiveDocument(document, workspace.configFile);
    expect(output).toContain('# workspace comment');
    expect(output).toContain('# selected connection');
    expect(parsed.timeoutMs).toBe(45_000);
    expect(parsed.profiles['wiki-main']?.limits.readConcurrency).toBe(7);
    expect(parsed.profiles['keep-cloud']).toMatchObject({token: 'untouched-token', email: 'untouched@example.com'});
  });

  it('preserves selected profile comments when the profile is renamed', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ywtc-interactive-rename-'));
    const workspace = resolveInitWorkspace({explicit: root});
    await fs.writeFile(workspace.configFile, existingYaml);
    const existing = await readExistingInteractiveConfig(workspace);
    const document = existing!.document!.clone();
    const selected = existing!.config!.profiles['wiki-main'];
    if (selected?.type !== 'yandex-wiki') throw new Error('expected Yandex profile');

    updateInteractiveProfile(document, selected.name, {...selected, name: 'wiki-renamed'});

    const output = document.toString();
    const parsed = validateInteractiveDocument(document, workspace.configFile);
    expect(output).toContain('wiki-renamed:');
    expect(output).toContain('# selected connection');
    expect(parsed.profiles['wiki-renamed']).toMatchObject({type: 'yandex-wiki'});
    expect(parsed.profiles['wiki-main']).toBeUndefined();
  });

  it('commits a new configuration with user-only permissions', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ywtc-interactive-new-'));
    const workspace = resolveInitWorkspace({explicit: path.join(root, 'workspace')});
    const result = await commitInteractiveConfig({workspace, document: completeDocument(), reset: false});
    expect(result).toEqual({configFile: workspace.configFile});
    expect((await fs.stat(workspace.configFile)).mode & 0o777).toBe(0o600);
    await expect(fs.stat(workspace.cacheDirectory)).resolves.toMatchObject({});
    await expect(fs.stat(workspace.reportsDirectory)).resolves.toMatchObject({});
  });

  it('backs up a reset configuration, preserves permissions, and leaves runtime state intact', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ywtc-interactive-reset-'));
    const workspace = resolveInitWorkspace({explicit: root});
    await fs.mkdir(workspace.statesDirectory, {recursive: true});
    await fs.writeFile(workspace.configFile, existingYaml, {mode: 0o640});
    const stateFile = path.join(workspace.statesDirectory, 'resume.json');
    await fs.writeFile(stateFile, '{"keep":true}\n');
    const original = await readExistingInteractiveConfig(workspace);
    if (!original) throw new Error('expected existing config');
    const result = await commitInteractiveConfig({
      workspace,
      document: completeDocument(),
      original,
      reset: true,
      now: new Date('2026-10-15T12:30:00.000Z'),
    });

    expect(result.backupFile).toContain(path.join('.states', 'backups', 'ywtc.config.20261015T123000-000Z.'));
    await expect(fs.readFile(result.backupFile!, 'utf8')).resolves.toBe(existingYaml);
    expect((await fs.stat(result.backupFile!)).mode & 0o777).toBe(0o600);
    expect((await fs.stat(workspace.configFile)).mode & 0o777).toBe(0o640);
    await expect(fs.readFile(stateFile, 'utf8')).resolves.toContain('keep');
  });

  it('semantically merges independent concurrent YAML edits and comments', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ywtc-interactive-conflict-'));
    const workspace = resolveInitWorkspace({explicit: root});
    await fs.writeFile(workspace.configFile, existingYaml);
    const original = await readExistingInteractiveConfig(workspace);
    if (!original) throw new Error('expected existing config');
    await fs.writeFile(workspace.configFile, `${existingYaml}# changed elsewhere\n`);
    await expect(commitInteractiveConfig({workspace, document: completeDocument(), original, reset: false}))
      .resolves.toEqual({configFile: workspace.configFile});
    await expect(fs.readFile(workspace.configFile, 'utf8')).resolves.toContain('# changed elsewhere');
  });

  it('rejects concurrent edits to the same semantic field', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ywtc-interactive-field-conflict-'));
    const workspace = resolveInitWorkspace({explicit: root});
    await fs.writeFile(workspace.configFile, existingYaml);
    const original = await readExistingInteractiveConfig(workspace);
    if (!original?.document || !original.config) throw new Error('expected existing config');
    const document = original.document.clone();
    const selected = original.config.profiles['wiki-main'];
    if (selected?.type !== 'yandex-wiki') throw new Error('expected Yandex profile');
    updateInteractiveProfile(document, selected.name, {...selected, webUrl: 'https://wizard.example.com'});
    await fs.writeFile(workspace.configFile, existingYaml.replace('https://wiki.example.com', 'https://external.example.com'));
    await expect(commitInteractiveConfig({workspace, document, original, reset: false}))
      .rejects.toBeInstanceOf(InteractiveConfigConflictError);
    await expect(fs.stat(workspace.statesDirectory)).rejects.toMatchObject({code: 'ENOENT'});
  });

  it('restores the previous config when fallback replacement fails', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ywtc-interactive-rollback-'));
    const workspace = resolveInitWorkspace({explicit: root});
    await fs.writeFile(workspace.configFile, existingYaml);
    const original = await readExistingInteractiveConfig(workspace);
    if (!original) throw new Error('expected existing config');
    let calls = 0;
    const operations = {
      unlink: fs.unlink,
      rename: async (from: PathLike, to: PathLike) => {
        calls += 1;
        if (calls === 1) throw Object.assign(new Error('replace denied'), {code: 'EPERM'});
        if (calls === 3) throw Object.assign(new Error('replacement failed'), {code: 'EIO'});
        await fs.rename(from, to);
      },
    };
    await expect(commitInteractiveConfig({workspace, document: completeDocument(), original, reset: false, operations}))
      .rejects.toThrow('replacement failed');
    await expect(fs.readFile(workspace.configFile, 'utf8')).resolves.toBe(existingYaml);
  });
});

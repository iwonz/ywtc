import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it, vi} from 'vitest';
import {ConnectionVerificationError, type ConnectionVerification} from '../src/connection-verifier.js';
import {readWorkspaceConfig} from '../src/config.js';
import {runInteractiveInit} from '../src/interactive-init.js';
import {
  type WizardPrompter,
  type SelectPromptOptions,
  type TextPromptOptions,
  WizardCancelledError,
} from '../src/wizard-prompts.js';

class ScriptedPrompter implements WizardPrompter {
  readonly output: string[] = [];
  readonly validationErrors: string[] = [];
  readonly initialValues: Array<{id: string; value?: string}> = [];

  constructor(private readonly responses: Record<string, string[]> = {}) {}

  intro(message: string): void { this.output.push(`intro:${message}`); }
  outro(message: string): void { this.output.push(`outro:${message}`); }
  cancel(message: string): void { this.output.push(`cancel:${message}`); }
  note(message: string, title?: string): void { this.output.push(`note:${title ?? ''}:${message}`); }
  info(message: string): void { this.output.push(`info:${message}`); }
  success(message: string): void { this.output.push(`success:${message}`); }
  error(message: string): void { this.output.push(`error:${message}`); }

  private next(id: string, fallback?: string): string {
    const value = this.responses[id]?.shift() ?? fallback;
    if (value === undefined) throw new Error(`No scripted response for ${id}`);
    if (value === '!cancel') throw new WizardCancelledError();
    return value;
  }

  private async validated(options: TextPromptOptions, fallback?: string): Promise<string> {
    this.initialValues.push({id: options.id, ...(options.initialValue !== undefined ? {value: options.initialValue} : {})});
    while (true) {
      const value = this.next(options.id, fallback);
      const error = options.validate?.(value);
      if (!error) return value;
      this.validationErrors.push(`${options.id}:${error}`);
    }
  }

  text(options: TextPromptOptions): Promise<string> {
    return this.validated(options, options.initialValue);
  }

  password(options: TextPromptOptions): Promise<string> {
    return this.validated(options);
  }

  async select<T extends string>(options: SelectPromptOptions<T>): Promise<T> {
    this.initialValues.push({id: options.id, ...(options.initialValue !== undefined ? {value: options.initialValue} : {})});
    const value = this.next(options.id, options.initialValue);
    const choice = options.options.find((candidate) => candidate.value === value);
    if (!choice || choice.disabled) throw new Error(`Invalid scripted selection ${value} for ${options.id}`);
    return value as T;
  }

  async task<T>(message: string, action: () => Promise<T>, success: (value: T) => string): Promise<T> {
    this.output.push(`task:${message}`);
    const value = await action();
    this.output.push(`task-success:${success(value)}`);
    return value;
  }
}

function successfulVerification(profile: {name: string; type: 'yandex-wiki' | 'confluence'}): ConnectionVerification {
  return {
    profile: profile.name,
    provider: profile.type,
    product: profile.type === 'yandex-wiki' ? 'Yandex Wiki Public API v1' : 'Confluence Data Center',
  };
}

function newWorkspaceResponses(root: string): Record<string, string[]> {
  return {
    'workspace.path': [root],
    'yandex.organization.id': ['', 'org-1'],
    'yandex.token': ['', 'wiki-secret'],
    'confluence.baseUrl': ['https://confluence.example.com/confluence'],
    'confluence.token': ['conf-secret'],
  };
}

const existingYaml = `# keep this comment
defaults: { timeoutMs: 30000, concurrency: 4 }
connections:
  wiki-main:
    type: yandex-wiki
    apiUrl: https://api.wiki.yandex.net/v1
    webUrl: https://wiki.example.com
    authType: oauth
    token: old-wiki-token
    organization: { type: yandex360, id: org-1 }
  conf-main:
    type: confluence
    deployment: data-center
    baseUrl: https://conf.example.com/confluence
    authType: pat
    token: old-conf-token
  untouched:
    type: confluence
    deployment: cloud
    baseUrl: https://tenant.atlassian.net
    authType: api-token
    token: untouched-token
    email: untouched@example.com
`;

describe('interactive init wizard', () => {
  it('validates required fields, navigates backward and forward, and commits only after both probes', async () => {
    const root = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'ywtc-wizard-')), 'workspace');
    const responses = newWorkspaceResponses(root);
    responses['confluence.navigation'] = ['back', 'continue'];
    responses['yandex.token']!.push('');
    responses['confluence.token']!.push('');
    const prompter = new ScriptedPrompter(responses);
    const verify = vi.fn(async (_config, profile) => successfulVerification(profile));

    const result = await runInteractiveInit({prompter, verify});
    expect(result).toMatchObject({status: 'completed', code: 0});
    expect(result.dryRunCommand).toBe(`ywtc migrate --source "<yandex-page-url>" --destination "<confluence-page-url>" --dry-run --workdir ${JSON.stringify(root)}`);
    expect(result.dryRunCommand).not.toContain('--source-profile');
    expect(result.dryRunCommand).not.toContain('--destination-profile');
    expect(result.dryRunCommand).not.toContain('--scope');
    expect(verify).toHaveBeenCalledTimes(2);
    expect(prompter.validationErrors).toEqual(expect.arrayContaining([
      expect.stringContaining('yandex.organization.id'), expect.stringContaining('yandex.token'),
    ]));
    const yandexNamePrompts = prompter.initialValues.filter((item) => item.id === 'yandex.name');
    expect(yandexNamePrompts).toHaveLength(2);
    expect(yandexNamePrompts[1]?.value).toBe('yandex');
    const config = readWorkspaceConfig(path.join(root, 'ywtc.config.yaml'));
    expect(config.profiles.yandex).toMatchObject({token: 'wiki-secret', organization: {id: 'org-1'}});
    expect(config.profiles.confluence).toMatchObject({token: 'conf-secret'});
    expect(prompter.output.join('\n')).not.toContain('wiki-secret');
    expect(prompter.output.join('\n')).not.toContain('conf-secret');
  });

  it('omits optional flags from the default-workspace dry-run handoff', async () => {
    const homeDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'ywtc-wizard-home-'));
    const root = path.join(homeDirectory, '.ywtc');
    const prompter = new ScriptedPrompter(newWorkspaceResponses(root));
    const result = await runInteractiveInit({
      prompter,
      homeDirectory,
      verify: async (_config, profile) => successfulVerification(profile),
    });
    expect(result.dryRunCommand).toBe('ywtc migrate --source "<yandex-page-url>" --destination "<confluence-page-url>" --dry-run');
  });

  it('supports IAM and Confluence Cloud while retrying a redacted failed probe', async () => {
    const root = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'ywtc-wizard-cloud-')), 'workspace');
    const prompter = new ScriptedPrompter({
      'workspace.path': [root],
      'yandex.authType': ['iam'],
      'yandex.organization.id': ['cloud-org'],
      'yandex.token': ['wiki-secret'],
      'confluence.deployment': ['cloud'],
      'confluence.baseUrl': ['https://tenant.atlassian.net'],
      'confluence.email': ['person@example.com'],
      'confluence.token': ['conf-secret'],
      'verification.failure': ['retry'],
    });
    let calls = 0;
    const verify = vi.fn(async (_config, profile) => {
      calls += 1;
      if (calls === 1) {
        throw new ConnectionVerificationError(profile.name, profile.type, 'authentication', 'bad wiki-secret person@example.com');
      }
      return successfulVerification(profile);
    });
    const result = await runInteractiveInit({prompter, verify});
    expect(result.status).toBe('completed');
    expect(verify).toHaveBeenCalledTimes(3);
    const config = readWorkspaceConfig(path.join(root, 'ywtc.config.yaml'));
    expect(config.profiles.yandex).toMatchObject({authType: 'iam', organization: {type: 'cloud'}});
    expect(config.profiles.confluence).toMatchObject({deployment: 'cloud', authType: 'api-token', email: 'person@example.com'});
    const output = prompter.output.join('\n');
    expect(output).not.toContain('wiki-secret');
    expect(output).not.toContain('person@example.com');
    expect(output).toContain('[REDACTED]');
  });

  it('edits selected profiles while preserving comments and other profiles', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ywtc-wizard-edit-'));
    const configFile = path.join(root, 'ywtc.config.yaml');
    await fs.writeFile(configFile, existingYaml, {mode: 0o640});
    const prompter = new ScriptedPrompter({
      'workspace.path': [root],
      'workspace.action': ['edit'],
      'yandex.profile': ['wiki-main'],
      'yandex.webUrl': ['https://wiki.changed.example'],
      'yandex.token': ['new-wiki-token', ''],
      'confluence.profile': ['conf-main'],
      'confluence.token': ['', ''],
      'confluence.navigation': ['back', 'continue'],
    });
    const result = await runInteractiveInit({prompter, verify: async (_config, profile) => successfulVerification(profile)});
    expect(result.status).toBe('completed');
    const output = await fs.readFile(configFile, 'utf8');
    expect(output).toContain('# keep this comment');
    const config = readWorkspaceConfig(configFile);
    expect(config.profiles['wiki-main']).toMatchObject({
      token: 'new-wiki-token',
      webUrl: 'https://wiki.changed.example',
    });
    expect(config.profiles.untouched).toMatchObject({token: 'untouched-token', email: 'untouched@example.com'});
    expect((await fs.stat(configFile)).mode & 0o777).toBe(0o640);
  });

  it('can leave an existing workspace untouched without any probes', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ywtc-wizard-noop-'));
    const configFile = path.join(root, 'ywtc.config.yaml');
    await fs.writeFile(configFile, existingYaml);
    const verify = vi.fn();
    const result = await runInteractiveInit({
      prompter: new ScriptedPrompter({'workspace.path': [root], 'workspace.action': ['exit']}),
      verify,
    });
    expect(result).toMatchObject({status: 'no-op', code: 0});
    expect(verify).not.toHaveBeenCalled();
    await expect(fs.readFile(configFile, 'utf8')).resolves.toBe(existingYaml);
  });

  it('resets an existing config through the wizard while backing it up and preserving state', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ywtc-wizard-reset-'));
    const configFile = path.join(root, 'ywtc.config.yaml');
    const states = path.join(root, '.states');
    await fs.mkdir(states);
    await fs.writeFile(configFile, existingYaml);
    await fs.writeFile(path.join(states, 'resume.json'), '{"keep":true}\n');
    const responses = newWorkspaceResponses(root);
    responses['workspace.action'] = ['reset'];
    const result = await runInteractiveInit({
      prompter: new ScriptedPrompter(responses),
      verify: async (_config, profile) => successfulVerification(profile),
    });
    expect(result).toMatchObject({status: 'completed'});
    expect(result.backupFile).toContain(path.join('.states', 'backups'));
    await expect(fs.readFile(result.backupFile!, 'utf8')).resolves.toBe(existingYaml);
    await expect(fs.readFile(path.join(states, 'resume.json'), 'utf8')).resolves.toContain('keep');
    const config = readWorkspaceConfig(configFile);
    expect(Object.keys(config.profiles).sort()).toEqual(['confluence', 'yandex']);
  });

  it('cancels without creating the selected workspace', async () => {
    const root = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'ywtc-wizard-cancel-')), 'workspace');
    const result = await runInteractiveInit({
      prompter: new ScriptedPrompter({'workspace.path': ['!cancel']}),
      verify: vi.fn(),
    });
    expect(result).toMatchObject({status: 'cancelled', code: 130});
    await expect(fs.stat(root)).rejects.toMatchObject({code: 'ENOENT'});
  });

  it('rejects non-TTY CLI use before creating a workspace', async () => {
    const root = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'ywtc-wizard-nontty-')), 'workspace');
    const run = spawnSync(process.execPath, [
      '--import', 'tsx', path.resolve('src/cli.ts'), 'init', '--interactive', '--workdir', root,
    ], {cwd: path.resolve('.'), encoding: 'utf8'});
    expect(run.status).toBe(2);
    expect(run.stderr).toContain('requires an interactive TTY');
    await expect(fs.stat(root)).rejects.toMatchObject({code: 'ENOENT'});
  });
});

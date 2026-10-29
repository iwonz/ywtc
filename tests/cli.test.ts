import {mkdtemp, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {cliHelp, parseCliArguments} from '../src/cli-arguments.js';
import {readWorkspaceConfig, secretValues, validateProfileSecrets} from '../src/config.js';
import {resolveDestinationLocator, resolveSourceLocator, sameRemoteInstance} from '../src/locators.js';

const yaml = `defaults: { timeoutMs: 30000, concurrency: 4 }
connections:
  wiki-main:
    type: yandex-wiki
    apiUrl: https://api.wiki.yandex.net/v1
    webUrl: https://wiki.example.com
    authType: oauth
    token: direct-wiki
    organization: { type: yandex360, id: org-1 }
  conf-main:
    type: confluence
    deployment: data-center
    baseUrl: https://conf.example.com/confluence
    authType: pat
    token: ""
  conf-cloud:
    type: confluence
    deployment: cloud
    baseUrl: https://tenant.atlassian.net
    authType: api-token
    token: direct-cloud
    email: person@example.com
`;

async function config(source = yaml) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ywtc-config-'));
  const configFile = path.join(directory, 'ywtc.config.yaml');
  await writeFile(configFile, source);
  return readWorkspaceConfig(configFile);
}

describe('CLI and named profiles', () => {
  it('parses local UI, durable background operations and task controls', () => {
    expect(parseCliArguments(['ui'])).toEqual({command: 'ui', port: 3000, open: true});
    expect(parseCliArguments(['ui', '-w', './work', '-p', '3456', '--no-open'])).toEqual({command: 'ui', port: 3456, open: false, workdir: './work'});
    for (const flag of ['--background', '-b']) {
      expect(parseCliArguments(['migrate', '-s', 'a', '-d', 'b', flag])).toMatchObject({background: true});
      expect(parseCliArguments(['retry', '11111111-1111-4111-8111-111111111111', flag])).toMatchObject({background: true});
      for (const kind of ['mentions', 'hashtags']) expect(parseCliArguments([kind, 'export', '-s', 'a', '-o', './decisions', flag])).toMatchObject({background: true});
    }
    expect(parseCliArguments(['migrations'])).toMatchObject({command: 'migrations', action: 'list', all: false});
    expect(parseCliArguments(['migrations', 'show', '11111111-1111-4111-8111-111111111111', '--json'])).toMatchObject({command: 'migrations', action: 'show', json: true});
    expect(parseCliArguments(['migrations', 'logs', '11111111-1111-4111-8111-111111111111', '-f'])).toMatchObject({action: 'logs', follow: true});
    expect(() => parseCliArguments(['migrate', '-i', '-b'])).toThrow(/background/);
    expect(() => parseCliArguments(['migrate', '-s', 'a', '-d', 'b', '-b', '-o'])).toThrow(/background/);
    expect(() => parseCliArguments(['ui', '-p', '0'])).toThrow(/port/);
    expect(() => parseCliArguments(['migrations', 'stop', '../config'])).toThrow(/Job ID/);
  });
  it('parses identity-preserving rewrite and rejects fresh or filesystem combinations', () => {
    for (const flag of ['--rewrite', '-R']) {
      expect(parseCliArguments(['migrate', '-s', 'root', '-d', '100', flag])).toMatchObject({rewrite: true, fresh: false});
      expect(parseCliArguments(['retry', '11111111-1111-4111-8111-111111111111', flag])).toMatchObject({rewrite: true});
    }
    expect(() => parseCliArguments(['migrate', '-s', 'root', '-d', '100', '--rewrite', '--fresh'])).toThrow(/--rewrite.*--fresh/);
    expect(() => parseCliArguments(['migrate', '-s', 'root', '-d', './site', '--rewrite', '-f', 'html'])).toThrow(/--rewrite.*remote/);
    expect(cliHelp('migrate')).toContain('-R, --rewrite');
    expect(cliHelp('retry')).toContain('-R, --rewrite');
  });

  it('parses interactive initialization and documents the TTY contract', () => {
    expect(parseCliArguments(['init', '--interactive', '--workdir', '~/guided'])).toEqual({
      command: 'init', interactive: true, workdir: '~/guided',
    });
    expect(parseCliArguments(['init'])).toEqual({command: 'init', interactive: false});
    expect(parseCliArguments(['init', '-i', '-w', '~/guided'])).toEqual({
      command: 'init', interactive: true, workdir: '~/guided',
    });
    expect(cliHelp('init')).toContain('--interactive');
    expect(cliHelp('init')).toContain('TTY wizard');
  });

  it('parses the universal migration surface', () => {
    expect(parseCliArguments([
      'migrate', '--source', '42', '--source-profile', 'wiki-main', '--destination', './site',
      '--scope', 'linked', '--source-status', 'current', '--format', 'html', '--archive', '--dry-run', '--open-report', '--concurrency', '8',
    ])).toMatchObject({
      command: 'migrate', source: '42', destination: './site', sourceProfile: 'wiki-main',
      scope: 'linked', sourceStatus: 'current', format: 'html', archive: true, dryRun: true, openReport: true, concurrency: 8,
      interactive: false,
    });
    expect(parseCliArguments(['migrate', '--source', 'root', '--destination', '100'])).toMatchObject({sourceStatus: 'all'});
    expect(parseCliArguments(['migrate', '--source', 'root', '--destination', '100'])).toMatchObject({comments: true});
    expect(parseCliArguments(['migrate', '--source', 'root', '--destination', '100', '--no-comments'])).toMatchObject({comments: false});
    expect(parseCliArguments(['doctor'])).toMatchObject({sourceStatus: 'all', comments: true});
    expect(parseCliArguments(['doctor', '--no-comments'])).toMatchObject({comments: false});
    expect(parseCliArguments(['reports', 'list', '--workdir', './workspace'])).toEqual({
      command: 'reports-list', workdir: './workspace',
    });
    expect(parseCliArguments(['reports', 'open'])).toEqual({command: 'reports-open'});
    expect(parseCliArguments(['reports', 'open', 'last'])).toEqual({command: 'reports-open', runId: 'last'});
    expect(parseCliArguments(['reports', 'open', '11111111-1111-4111-8111-111111111111'])).toEqual({
      command: 'reports-open', runId: '11111111-1111-4111-8111-111111111111',
    });
    expect(parseCliArguments([
      'retry', '11111111-1111-4111-8111-111111111111', '-w', './workspace', '-n', '-o', '-j', '3',
    ])).toEqual({
      command: 'retry', runId: '11111111-1111-4111-8111-111111111111', workdir: './workspace',
      dryRun: true, openReport: true, concurrency: 3,
    });
  });

  it('maps every documented short option to its long migration or update option', () => {
    expect(parseCliArguments([
      'migrate', '-i', '-w', './work', '-s', '42', '-d', './site', '-S', 'wiki-main', '-D', 'conf-main',
      '-m', 'linked', '-t', 'current', '-N', '-f', 'html', '-a', '-n', '-F', '-o', '-j', '8', '-r', 'run.json',
    ])).toMatchObject({
      command: 'migrate', interactive: true, workdir: './work', source: '42', destination: './site',
      sourceProfile: 'wiki-main', destinationProfile: 'conf-main', scope: 'linked', sourceStatus: 'current',
      comments: false, format: 'html', archive: true, dryRun: true, fresh: true, openReport: true,
      concurrency: 8, stateFilename: 'run.json',
    });
    expect(parseCliArguments(['migrate', '-i', '-C'])).toMatchObject({command: 'migrate', interactive: true, comments: true});
    expect(parseCliArguments(['doctor', '-s', 'a', '-d', 'b', '-m', 'page', '-t', 'all', '-N'])).toMatchObject({
      command: 'doctor', source: 'a', destination: 'b', scope: 'page', sourceStatus: 'all', comments: false,
    });
    expect(parseCliArguments(['reports', 'list', '-w', './workspace'])).toEqual({command: 'reports-list', workdir: './workspace'});
    expect(parseCliArguments(['update', '-i', '-c', 'npm'])).toEqual({command: 'update', install: true, via: 'npm'});
  });

  it('rejects unknown and conflicting options with current usage', () => {
    expect(() => parseCliArguments(['migrate', '--source', 'a', '--destination', 'b', '--target', 'c'])).toThrow(/unknown option '--target'/);
    expect(() => parseCliArguments(['migrate', '--source', 'a', '--destination', 'b', '--single-page'])).toThrow(/unknown option '--single-page'/);
    expect(() => parseCliArguments(['migrate', '--source', 'a', '--destination', 'b', '--archive'])).toThrow(/requires --format/);
    expect(() => parseCliArguments(['migrate', '--source', 'a'])).toThrow(/requires both --source and --destination/);
    expect(parseCliArguments(['migrate', '--interactive', '--archive'])).toMatchObject({
      command: 'migrate', interactive: true, archive: true,
    });
    expect(() => parseCliArguments(['doctor', '--source', 'a'])).toThrow(/both --source and --destination/);
    expect(() => parseCliArguments(['migrate', '--source', 'a', '--destination', 'https://example.com', '--format', 'html'])).toThrow(/remote HTTP/);
    expect(() => parseCliArguments(['retry', 'last'])).toThrow(/canonical Run ID/);
    expect(() => parseCliArguments(['retry', '11111111-1111-4111-8111-111111111111', '--source', 'a'])).toThrow(/unknown option '--source'/);
    expect(cliHelp('migrate')).toContain('--scope');
    expect(cliHelp('migrate')).toContain('--source-status');
    expect(cliHelp('doctor')).toContain('--source-status');
    expect(cliHelp('migrate')).toContain('--no-comments');
    expect(cliHelp('doctor')).toContain('--no-comments');
    expect(cliHelp('migrate')).toContain('--open-report');
    expect(cliHelp('reports')).toContain('list');
    expect(cliHelp('reports')).toContain('open');
    expect(cliHelp('reports')).toContain('last');
    expect(cliHelp('retry')).toContain('canonical Run ID');
    expect(cliHelp('migrate')).toContain('configured CWD');
  });

  it('loads direct credentials without process-environment overrides and resolves locators', async () => {
    const original = process.env.WIKI_TOKEN;
    process.env.WIKI_TOKEN = 'process-wiki';
    try {
      const loaded = await config();
      expect(loaded.profiles['wiki-main']).toMatchObject({token: 'direct-wiki', type: 'yandex-wiki'});
      expect(resolveSourceLocator(loaded, 'https://wiki.example.com/team/start').profile.name).toBe('wiki-main');
      expect(resolveDestinationLocator({config: loaded, value: 'https://conf.example.com/confluence/pages/viewpage.action?pageId=12'})).toMatchObject({type: 'remote', profile: {name: 'conf-main'}});
      expect(resolveDestinationLocator({config: loaded, value: './site', format: 'html', cwd: '/tmp'})).toEqual({type: 'directory', path: '/tmp/site', format: 'html'});
      expect(() => resolveSourceLocator(loaded, '42')).toThrow(/--source-profile/);
      expect(resolveSourceLocator(loaded, 'team/start').profile.name).toBe('wiki-main');
      const confluenceProfile = loaded.profiles['conf-cloud']!;
      if (confluenceProfile.type !== 'confluence') throw new Error('test profile must be Confluence');
      const cloudWiki = {...confluenceProfile, name: 'cloud-wiki', baseUrl: 'https://tenant.atlassian.net/wiki'};
      expect(sameRemoteInstance(confluenceProfile, cloudWiki)).toBe(true);
    } finally {
      if (original === undefined) delete process.env.WIKI_TOKEN;
      else process.env.WIKI_TOKEN = original;
    }
  });

  it('reports exact current-format paths for unknown fields and invalid auth pairs', async () => {
    await expect(config(`schemaVersion: 2\n${yaml}`)).rejects.toThrow(/schemaVersion/);
    await expect(config(yaml.replace('token: direct-wiki', 'token: direct-wiki\n    tokenEnv: WIKI_TOKEN'))).rejects.toThrow(/connections\.wiki-main\.tokenEnv/);
    await expect(config(yaml.replace('authType: pat', 'authType: api-token'))).rejects.toThrow(/connections\.conf-main\.authType/);
  });

  it('requires credentials only for selected profiles and never prints another secret', async () => {
    const loaded = await config(yaml.replace('direct-wiki', 'do-not-print'));
    expect(() => validateProfileSecrets(loaded, [loaded.profiles['wiki-main']!])).not.toThrow();
    expect(() => validateProfileSecrets(loaded, [loaded.profiles['conf-main']!])).toThrow(/connections\.conf-main\.token/);
    try {
      validateProfileSecrets(loaded, Object.values(loaded.profiles));
    } catch (error) {
      expect(String(error)).not.toContain('do-not-print');
    }
    expect(secretValues(loaded)).toContain('do-not-print');
    expect(secretValues(loaded)).toContain('person@example.com');
  });

  it('requires a direct Cloud email only when that profile is selected', async () => {
    const loaded = await config(yaml.replace('    email: person@example.com\n', ''));
    expect(() => validateProfileSecrets(loaded, [loaded.profiles['wiki-main']!])).not.toThrow();
    expect(() => validateProfileSecrets(loaded, [loaded.profiles['conf-cloud']!])).toThrow(/connections\.conf-cloud\.email/);
  });
});

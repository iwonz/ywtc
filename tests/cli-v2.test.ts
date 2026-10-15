import {mkdtemp, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {cliHelp, parseCliArguments} from '../src/cli-arguments.js';
import {readWorkspaceConfig, validateProfileSecrets} from '../src/config.js';
import {resolveDestinationLocator, resolveSourceLocator, sameRemoteInstance} from '../src/locators.js';

const yaml = `schemaVersion: 2
defaults: { timeoutMs: 30000, concurrency: 4 }
connections:
  wiki-main:
    type: yandex-wiki
    apiUrl: https://api.wiki.yandex.net/v1
    webUrl: https://wiki.example.com
    authType: oauth
    tokenEnv: WIKI_TOKEN
    organization: { type: yandex360, id: org-1 }
  conf-main:
    type: confluence
    deployment: data-center
    baseUrl: https://conf.example.com/confluence
    authType: pat
    tokenEnv: CONF_TOKEN
`;

async function config() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ywtc-config-v2-'));
  const env = path.join(directory, '.env');
  const configFile = path.join(directory, 'ywtc.config.yaml');
  await writeFile(env, 'WIKI_TOKEN=file-wiki\nCONF_TOKEN=file-conf\n');
  await writeFile(configFile, yaml);
  return readWorkspaceConfig(env, configFile, {WIKI_TOKEN: 'process-wiki'});
}

describe('v2 CLI and named profiles', () => {
  it('parses the universal migration surface', () => {
    expect(parseCliArguments([
      'migrate', '--source', '42', '--source-profile', 'wiki-main', '--destination', './site',
      '--scope', 'linked', '--format', 'html', '--archive', '--dry-run', '--concurrency', '8',
    ])).toMatchObject({
      command: 'migrate', source: '42', destination: './site', sourceProfile: 'wiki-main',
      scope: 'linked', format: 'html', archive: true, dryRun: true, concurrency: 8,
    });
  });

  it('rejects removed and conflicting options with migration guidance', () => {
    expect(() => parseCliArguments(['migrate', '--source', 'a', '--target', 'b'])).toThrow(/--destination/);
    expect(() => parseCliArguments(['migrate', '--source', 'a', '--destination', 'b', '--single-page'])).toThrow(/--scope page/);
    expect(() => parseCliArguments(['migrate', '--source', 'a', '--destination', 'b', '--archive'])).toThrow(/requires --format/);
    expect(() => parseCliArguments(['doctor', '--source', 'a'])).toThrow(/both --source and --destination/);
    expect(() => parseCliArguments(['migrate', '--source', 'a', '--destination', 'https://example.com', '--format', 'html'])).toThrow(/remote HTTP/);
    expect(cliHelp('migrate')).toContain('--scope');
  });

  it('loads profiles, applies process secret precedence, and resolves URL/path locators', async () => {
    const loaded = await config();
    expect(loaded.profiles['wiki-main']).toMatchObject({token: 'process-wiki', type: 'yandex-wiki'});
    expect(resolveSourceLocator(loaded, 'https://wiki.example.com/team/start').profile.name).toBe('wiki-main');
    expect(resolveDestinationLocator({config: loaded, value: 'https://conf.example.com/confluence/pages/viewpage.action?pageId=12'})).toMatchObject({type: 'remote', profile: {name: 'conf-main'}});
    expect(resolveDestinationLocator({config: loaded, value: './site', format: 'html', cwd: '/tmp'})).toEqual({type: 'directory', path: '/tmp/site', format: 'html'});
    expect(() => resolveSourceLocator(loaded, '42')).toThrow(/--source-profile/);
    expect(resolveSourceLocator(loaded, 'team/start').profile.name).toBe('wiki-main');
    const confluenceProfile = loaded.profiles['conf-main']!;
    if (confluenceProfile.type !== 'confluence') throw new Error('test profile must be Confluence');
    const cloudRoot = {...confluenceProfile, deployment: 'cloud' as const, authType: 'api-token' as const, baseUrl: 'https://tenant.atlassian.net'};
    const cloudWiki = {...cloudRoot, name: 'cloud-wiki', baseUrl: 'https://tenant.atlassian.net/wiki'};
    expect(sameRemoteInstance(cloudRoot, cloudWiki)).toBe(true);
  });

  it('never includes a populated secret in configuration errors', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'ywtc-config-invalid-'));
    const env = path.join(directory, '.env');
    const configFile = path.join(directory, 'ywtc.config.yaml');
    await writeFile(env, 'WIKI_TOKEN=do-not-print\n');
    await writeFile(configFile, yaml);
    const loaded = readWorkspaceConfig(env, configFile);
    expect(() => validateProfileSecrets(loaded, Object.values(loaded.profiles))).toThrow(/CONF_TOKEN/);
    try { validateProfileSecrets(loaded, Object.values(loaded.profiles)); } catch (error) { expect(String(error)).not.toContain('do-not-print'); }
  });

  it('requires credentials only for profiles selected by an operation', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'ywtc-config-selected-'));
    const env = path.join(directory, '.env');
    const configFile = path.join(directory, 'ywtc.config.yaml');
    await writeFile(env, 'WIKI_TOKEN=ready\n');
    await writeFile(configFile, yaml);
    const loaded = readWorkspaceConfig(env, configFile);
    expect(() => validateProfileSecrets(loaded, [loaded.profiles['wiki-main']!])).not.toThrow();
    expect(() => validateProfileSecrets(loaded, [loaded.profiles['conf-main']!])).toThrow(/CONF_TOKEN/);
  });
});

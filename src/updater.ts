import {spawn} from 'node:child_process';
import {access} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export type InstallationChannel = 'brew' | 'global-npm' | 'npx' | 'local' | 'source' | 'unknown';

export interface UpdateResult {
  current: string;
  latest: string;
  channel: InstallationChannel;
  updateAvailable: boolean;
  installed: boolean;
  command: string;
}

async function pathExists(filename: string): Promise<boolean> {
  try {
    await access(filename);
    return true;
  } catch {
    return false;
  }
}

export async function detectInstallationChannel(options: {
  entrypoint?: string;
  environment?: NodeJS.ProcessEnv;
  packageRoot?: string;
} = {}): Promise<InstallationChannel> {
  const environment = options.environment ?? process.env;
  const entrypoint = path.resolve(options.entrypoint ?? process.argv[1] ?? '');
  const packageRoot = options.packageRoot ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  if (entrypoint.includes('/Cellar/ywtc/') || entrypoint.includes('/homebrew/')) return 'brew';
  if (environment.npm_command === 'exec' || entrypoint.includes('/_npx/')) return 'npx';
  if (await pathExists(path.join(packageRoot, '.git'))) return 'source';
  if (entrypoint.includes(`${path.sep}node_modules${path.sep}.bin${path.sep}`)) return 'local';
  const npmPrefix = environment.npm_config_prefix;
  if (npmPrefix && entrypoint.startsWith(path.resolve(npmPrefix))) return 'global-npm';
  if (entrypoint.includes(`${path.sep}lib${path.sep}node_modules${path.sep}@iwonz${path.sep}ywtc${path.sep}`)) return 'global-npm';
  return 'unknown';
}

export async function latestPublishedVersion(fetchImplementation: typeof fetch = fetch): Promise<string> {
  const response = await fetchImplementation('https://registry.npmjs.org/@iwonz%2Fywtc/latest', {
    headers: {Accept: 'application/json'},
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Cannot check npm for updates: HTTP ${response.status}`);
  const payload = await response.json() as {version?: unknown};
  if (typeof payload.version !== 'string') throw new Error('npm update response does not contain a version');
  return payload.version;
}

function semverParts(version: string): [number, number, number] {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return [0, 0, 0];
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function isNewerVersion(candidate: string, current: string): boolean {
  const left = semverParts(candidate);
  const right = semverParts(current);
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return (left[index] ?? 0) > (right[index] ?? 0);
  }
  return false;
}

function runProcess(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {shell: false, stdio: 'inherit'});
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} failed with ${signal ? `signal ${signal}` : `exit code ${code}`}`));
    });
  });
}

export async function runUpdate(options: {
  currentVersion: string;
  install: boolean;
  via?: 'npm' | 'brew';
  channel?: InstallationChannel;
  fetchLatest?: () => Promise<string>;
  execute?: (command: string, args: string[]) => Promise<void>;
}): Promise<UpdateResult> {
  const channel = options.channel ?? await detectInstallationChannel();
  const latest = await (options.fetchLatest ?? latestPublishedVersion)();
  const requested = options.via ?? (channel === 'brew' ? 'brew' : 'npm');
  const command = requested === 'brew' ? 'brew update && brew upgrade ywtc' : 'npm install -g @iwonz/ywtc@latest';
  const updateAvailable = isNewerVersion(latest, options.currentVersion);
  const safe = (requested === 'brew' && channel === 'brew') || (requested === 'npm' && channel === 'global-npm');
  if (!options.install || !updateAvailable || !safe) {
    return {current: options.currentVersion, latest, channel, updateAvailable, installed: false, command};
  }
  const execute = options.execute ?? runProcess;
  if (requested === 'brew') {
    await execute('brew', ['update']);
    await execute('brew', ['upgrade', 'ywtc']);
  } else {
    await execute('npm', ['install', '-g', '@iwonz/ywtc@latest']);
  }
  return {current: options.currentVersion, latest, channel, updateAvailable, installed: true, command};
}

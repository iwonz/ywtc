import {execFile} from 'node:child_process';
import {mkdtemp, readFile, stat} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {promisify} from 'node:util';

const execFileAsync = promisify(execFile);

interface PackResult {
  filename: string;
  files: Array<{path: string}>;
}

const temporary = await mkdtemp(path.join(os.tmpdir(), 'ywtc-package-'));
const npmEnvironment = {...process.env, npm_config_cache: path.join(temporary, 'npm-cache')};
const packed = await execFileAsync('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', temporary], {
  cwd: process.cwd(),
  encoding: 'utf8',
  env: npmEnvironment,
});
const packResult = (JSON.parse(packed.stdout) as PackResult[])[0];
if (!packResult) throw new Error('npm pack returned no artifact');
const archive = path.join(temporary, packResult.filename);
await stat(archive);

const forbidden = packResult.files
  .map((file) => file.path)
  .filter((filename) => filename === '.env' || filename.startsWith('.states/') || filename.includes('/.states/'));
if (forbidden.length > 0) throw new Error(`Packed archive contains runtime data: ${forbidden.join(', ')}`);

const prefix = path.join(temporary, 'prefix');
await execFileAsync('npm', ['install', '--global', '--ignore-scripts', '--prefix', prefix, archive], {
  cwd: temporary,
  encoding: 'utf8',
  env: npmEnvironment,
});
const executable = path.join(prefix, 'bin', 'ywtc');
const version = await execFileAsync(executable, ['--version'], {encoding: 'utf8'});
const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as {version: string};
if (version.stdout.trim() !== packageJson.version) throw new Error('Installed ywtc version does not match package.json');
await execFileAsync(executable, ['--help'], {encoding: 'utf8'});
const workspace = path.join(temporary, 'workspace');
await execFileAsync(executable, ['init', '--workdir', workspace], {encoding: 'utf8'});
await Promise.all([
  stat(path.join(workspace, '.ywtc-workspace.json')),
  stat(path.join(workspace, '.env')),
  stat(path.join(workspace, '.states')),
]);
try {
  await execFileAsync(executable, ['migrate', '--workdir', workspace, '--source', 'docs', '--target', '123'], {encoding: 'utf8'});
  throw new Error('Migration unexpectedly accepted an unconfigured workspace');
} catch (error) {
  const stderr = (error as {stderr?: string}).stderr ?? '';
  if (!stderr.includes(path.join(workspace, '.env')) || !stderr.includes('YANDEX_WIKI_TOKEN')) {
    throw new Error(`Unconfigured workspace error is not actionable: ${stderr}`);
  }
}
process.stdout.write(`Package verified: ${packResult.filename}\n`);

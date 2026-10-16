import {execFile} from 'node:child_process';
import {access, mkdtemp, readFile, stat} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {promisify} from 'node:util';

const execFileAsync = promisify(execFile);

interface PackResult {
  filename: string;
  files: Array<{path: string}>;
}

function readPackResult(output: string): PackResult {
  const parsed = JSON.parse(output) as unknown;
  const candidates = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object'
      ? Object.values(parsed)
      : [];
  const result = candidates.length === 1 ? candidates[0] : undefined;
  if (
    !result ||
    typeof result !== 'object' ||
    !('filename' in result) ||
    typeof result.filename !== 'string' ||
    !result.filename ||
    !('files' in result) ||
    !Array.isArray(result.files)
  ) {
    throw new Error('npm pack returned no single valid artifact');
  }
  return result as PackResult;
}

const temporary = await mkdtemp(path.join(os.tmpdir(), 'ywtc-package-'));
const npmEnvironment = {...process.env, npm_config_cache: path.join(temporary, 'npm-cache')};
const packed = await execFileAsync('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', temporary], {
  cwd: process.cwd(),
  encoding: 'utf8',
  env: npmEnvironment,
});
const packResult = readPackResult(packed.stdout);
const archive = path.join(temporary, packResult.filename);
await stat(archive);

const forbidden = packResult.files
  .map((file) => file.path)
  .filter((filename) => filename === '.env'
    || filename === '.ywtc-workspace.json'
    || filename === 'ywtc.config.yaml'
    || filename.startsWith('.states/')
    || filename.includes('/.states/'));
if (forbidden.length > 0) throw new Error(`Packed archive contains runtime data: ${forbidden.join(', ')}`);
for (const required of ['dist/report-ui/index.html', 'docs/assets/report-header-transparent.png']) {
  if (!packResult.files.some((file) => file.path === required)) throw new Error(`Packed archive is missing ${required}`);
}

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
const initHelp = await execFileAsync(executable, ['init', '--help'], {encoding: 'utf8'});
if (!initHelp.stdout.includes('--interactive') || !initHelp.stdout.includes('TTY wizard')) {
  throw new Error('Installed ywtc init help does not document the interactive TTY wizard');
}

const rejectedInteractiveWorkspace = path.join(temporary, 'rejected-interactive-workspace');
try {
  await execFileAsync(executable, ['init', '--interactive', '--workdir', rejectedInteractiveWorkspace], {encoding: 'utf8'});
  throw new Error('Interactive init unexpectedly accepted non-TTY input');
} catch (error) {
  const result = error as {code?: number; stderr?: string};
  if (result.code !== 2 || !result.stderr?.includes('requires an interactive TTY')) {
    throw new Error(`Interactive init non-TTY diagnosis is not actionable: ${result.stderr ?? String(error)}`);
  }
}
await access(rejectedInteractiveWorkspace).then(
  () => { throw new Error('Rejected interactive init modified the workspace'); },
  () => undefined,
);

const workspace = path.join(temporary, 'initialized-workspace');
await execFileAsync(executable, ['init', '--workdir', workspace], {encoding: 'utf8'});
await Promise.all([
  stat(path.join(workspace, 'ywtc.config.yaml')),
  stat(path.join(workspace, '.states')),
  stat(path.join(workspace, '.states', 'cache')),
  stat(path.join(workspace, '.states', 'reports')),
]);
await Promise.all([
  access(path.join(workspace, '.ywtc-workspace.json')).then(() => { throw new Error('init created a workspace marker'); }, () => undefined),
  access(path.join(workspace, '.env')).then(() => { throw new Error('init created an .env file'); }, () => undefined),
]);

const missingWorkspace = path.join(temporary, 'missing-workspace');
try {
  await execFileAsync(executable, ['doctor', '--workdir', missingWorkspace], {encoding: 'utf8'});
  throw new Error('Doctor unexpectedly accepted a missing workspace');
} catch (error) {
  const stderr = (error as {stderr?: string}).stderr ?? '';
  if (!stderr.includes(path.join(missingWorkspace, 'ywtc.config.yaml')) || !stderr.includes('ywtc init --workdir')) {
    throw new Error(`Missing workspace diagnosis is not actionable: ${stderr}`);
  }
}
await access(missingWorkspace).then(
  () => { throw new Error('Doctor modified a missing workspace'); },
  () => undefined,
);

const automaticWorkspace = path.join(temporary, 'automatic-workspace');
try {
  await execFileAsync(executable, [
    'migrate', '--workdir', automaticWorkspace,
    '--source-profile', 'yandex', '--source', 'docs',
    '--destination-profile', 'confluence', '--destination', '123',
  ], {encoding: 'utf8'});
  throw new Error('Migration unexpectedly accepted an unconfigured workspace');
} catch (error) {
  const stderr = (error as {stderr?: string}).stderr ?? '';
  if (!stderr.includes(path.join(automaticWorkspace, 'ywtc.config.yaml')) || !stderr.includes('connections.yandex.organization.id')) {
    throw new Error(`Unconfigured workspace error is not actionable: ${stderr}`);
  }
}
await Promise.all([
  stat(path.join(automaticWorkspace, 'ywtc.config.yaml')),
  stat(path.join(automaticWorkspace, '.states', 'cache')),
  stat(path.join(automaticWorkspace, '.states', 'reports')),
]);

const installedReportModule = path.join(prefix, 'lib', 'node_modules', '@iwonz', 'ywtc', 'dist', 'report.js');
const installedReportDirectory = path.join(temporary, 'installed-report');
const reportSmoke = `
  import {TransferReport} from ${JSON.stringify(pathToFileURL(installedReportModule).toString())};
  const report = new TransferReport({
    dryRun: true,
    scope: 'page',
    direction: 'yandex-wiki → html',
    source: {provider: 'yandex-wiki', profile: 'wiki', rootId: '1', title: 'Smoke', url: 'https://wiki.example.com/smoke'},
    destination: {provider: 'filesystem', id: '/tmp/export', format: 'html'},
    state: {id: 'smoke', path: '/tmp/state.json', mode: 'automatic', source: 'new'},
  });
  report.addPage({
    sourceCanonicalId: 'wiki:1', sourceId: '1', sourceTitle: 'Smoke', sourceUrl: 'https://wiki.example.com/smoke',
    depth: 0, status: 'planned', inventoryStatus: 'complete', resources: 0, resourceItems: [], sourceBytes: 0,
    transferredBytes: 0, bytesUnknown: 0, links: 0, images: 0, tables: 0, grids: 0, codeBlocks: 0,
    degraded: false, resourceFallbacks: [], warnings: [], normalizations: [],
    comments: {status: 'planned', threads: 0, comments: 0, participants: 0, attachments: 0, bytes: 0},
  });
  report.finish('completed');
  const paths = await report.write(${JSON.stringify(installedReportDirectory)});
  process.stdout.write(JSON.stringify(paths));
`;
const generated = await execFileAsync(process.execPath, ['--input-type=module', '--eval', reportSmoke], {encoding: 'utf8'});
const generatedPaths = JSON.parse(generated.stdout) as {html: string; json: string};
const installedHtml = await readFile(generatedPaths.html, 'utf8');
await stat(generatedPaths.json);
if (!installedHtml.includes('Content-Security-Policy') || !installedHtml.includes('data:image/png;base64,')) {
  throw new Error('Installed package did not generate a complete autonomous report');
}
process.stdout.write(`Package verified: ${packResult.filename}\n`);

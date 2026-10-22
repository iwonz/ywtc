import {execFile} from 'node:child_process';
import {createServer} from 'node:http';
import {access, mkdir, mkdtemp, readdir, readFile, stat, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {promisify} from 'node:util';
import {stringify as stringifyYaml} from 'yaml';

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
process.stdout.write('Packing release artifact...\n');
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
    || filename.includes('/.states/')
    || filename.endsWith('.part')
    || filename.endsWith('.part.json')
    || filename.startsWith('reports/')
    || filename.startsWith('cache/'));
if (forbidden.length > 0) throw new Error(`Packed archive contains runtime data: ${forbidden.join(', ')}`);
for (const required of ['dist/report-ui/index.html', 'docs/assets/report-header-transparent.png']) {
  if (!packResult.files.some((file) => file.path === required)) throw new Error(`Packed archive is missing ${required}`);
}

const prefix = path.join(temporary, 'prefix');
process.stdout.write('Installing packed CLI in an isolated prefix...\n');
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
const migrateHelp = await execFileAsync(executable, ['migrate', '--help'], {encoding: 'utf8'});
for (const option of [
  '-i, --interactive', '-s, --source', '-d, --destination', '-S, --source-profile', '-D, --destination-profile',
  '-m, --scope', '-t, --source-status', '-C, --comments', '-N, --no-comments', '-f, --format', '-a, --archive',
  '-n, --dry-run', '-F, --fresh', '-o, --open-report', '-j, --concurrency', '-r, --state', '-w, --workdir',
]) {
  if (!migrateHelp.stdout.includes(option)) throw new Error(`Installed ywtc migrate help is missing ${option}`);
}
const retryHelp = await execFileAsync(executable, ['retry', '--help'], {encoding: 'utf8'});
for (const option of ['-w, --workdir', '-n, --dry-run', '-o, --open-report', '-j, --concurrency']) {
  if (!retryHelp.stdout.includes(option)) throw new Error(`Installed ywtc retry help is missing ${option}`);
}
try {
  await execFileAsync(executable, ['retry', 'last'], {encoding: 'utf8'});
  throw new Error('Installed ywtc retry unexpectedly accepted the non-canonical selector "last"');
} catch (error) {
  const stderr = (error as {stderr?: string}).stderr ?? '';
  if (!stderr.includes('canonical Run ID')) throw new Error(`Installed ywtc retry ID diagnosis is not actionable: ${stderr}`);
}
const updateHelp = await execFileAsync(executable, ['update', '--help'], {encoding: 'utf8'});
for (const option of ['-i, --install', '-c, --via']) {
  if (!updateHelp.stdout.includes(option)) throw new Error(`Installed ywtc update help is missing ${option}`);
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

const rejectedInteractiveMigrationWorkspace = path.join(temporary, 'rejected-interactive-migration-workspace');
try {
  await execFileAsync(executable, ['migrate', '-i', '-w', rejectedInteractiveMigrationWorkspace], {encoding: 'utf8'});
  throw new Error('Interactive migration unexpectedly accepted non-TTY input');
} catch (error) {
  const result = error as {code?: number; stderr?: string};
  if (result.code !== 2 || !result.stderr?.includes('migrate --interactive requires an interactive TTY')) {
    throw new Error(`Interactive migration non-TTY diagnosis is not actionable: ${result.stderr ?? String(error)}`);
  }
}
await access(rejectedInteractiveMigrationWorkspace).then(
  () => { throw new Error('Rejected interactive migration modified the workspace'); },
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

const completedRunId = '11111111-1111-4111-8111-111111111111';
const completedState = path.join(workspace, '.states', 'completed.json');
const completedReportDirectory = path.join(workspace, '.states', 'reports', completedRunId);
await mkdir(completedReportDirectory, {recursive: true});
await writeFile(completedState, '{}\n', {mode: 0o600});
await writeFile(path.join(completedReportDirectory, 'index.html'), '<!doctype html><title>completed</title>', {mode: 0o600});
await writeFile(path.join(completedReportDirectory, 'report.json'), `${JSON.stringify({
  runId: completedRunId,
  startedAt: '2026-10-21T10:00:00.000Z',
  finishedAt: '2026-10-21T10:01:00.000Z',
  status: 'completed',
  dryRun: false,
  commentsEnabled: false,
  scope: 'page',
  sourceStatus: 'all',
  direction: 'yandex-wiki → confluence',
  source: {provider: 'yandex-wiki', profile: 'yandex', rootId: '1', title: 'Root', url: 'https://wiki.example/root'},
  destination: {provider: 'confluence', profile: 'confluence', id: '2', url: 'https://confluence.example/pages/2'},
  invocation: {
    source: {locator: 'https://wiki.example/root', profile: 'yandex'},
    destination: {type: 'remote', locator: 'https://confluence.example/pages/2', profile: 'confluence'},
    scope: 'page', sourceStatus: 'all', comments: false, archive: false,
    state: {mode: 'automatic', path: completedState},
  },
  state: {id: 'completed', path: completedState, mode: 'automatic', source: 'existing'},
  pages: [], excludedPages: [], edges: [], hierarchyRepairs: [], warnings: [], errors: [], issues: [], outputs: [],
  summary: {inventoryComplete: true, inventoryRemainingFailures: 0, complete: 0, partial: 0, failed: 0, blocked: 0, conflicts: 0, notStartedPages: 0},
}, null, 2)}\n`, {mode: 0o600});
const reportsBeforeNoActionRetry = await readdir(path.join(workspace, '.states', 'reports'));
const noActionRetry = await execFileAsync(executable, ['retry', completedRunId, '--workdir', workspace], {encoding: 'utf8'});
if (!noActionRetry.stdout.includes('Migration is already complete')) throw new Error('Installed ywtc retry did not recognize a completed lineage locally');
const reportsAfterNoActionRetry = await readdir(path.join(workspace, '.states', 'reports'));
if (reportsAfterNoActionRetry.length !== reportsBeforeNoActionRetry.length) throw new Error('No-action retry created an unexpected report');

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

const providerFailureWorkspace = path.join(temporary, 'provider-failure-workspace');
process.stdout.write('Verifying packaged provider-failure handling...\n');
await mkdir(providerFailureWorkspace, {recursive: true});
const providerRequests: string[] = [];
const unavailableServer = createServer((request, response) => {
  providerRequests.push(request.url ?? '');
  response.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
  response.end('<!doctype html><html><head><title>Confluence had problems starting up</title></head><body><h1>Error when checking AWS S3 attachment storage connectivity</h1></body></html>');
});
await new Promise<void>((resolve, reject) => {
  unavailableServer.once('error', reject);
  unavailableServer.listen(0, '127.0.0.1', resolve);
});
try {
  const address = unavailableServer.address();
  if (!address || typeof address === 'string') throw new Error('Could not start the package provider-failure fixture');
  await writeFile(path.join(providerFailureWorkspace, 'ywtc.config.yaml'), stringifyYaml({
    defaults: {timeoutMs: 1_000, concurrency: 1},
    connections: {
      confluence: {
        type: 'confluence', deployment: 'data-center', baseUrl: `http://127.0.0.1:${address.port}/confluence`,
        authType: 'pat', token: 'package-smoke-token',
        limits: {
          readConcurrency: 1, writeConcurrency: 1, downloadConcurrency: 1, uploadConcurrency: 1,
          requestsPerSecond: 20, burst: 20,
        },
      },
    },
  }), {mode: 0o600});
  let failure: {code?: number; stdout?: string; stderr?: string} | undefined;
  try {
    await execFileAsync(executable, [
      'migrate', '--workdir', providerFailureWorkspace,
      '--source-profile', 'confluence', '--source', '1',
      '--destination-profile', 'confluence', '--destination', '2',
      '--scope', 'page', '--dry-run', '--no-comments',
    ], {encoding: 'utf8', timeout: 15_000});
  } catch (error) {
    failure = error as {code?: number; stdout?: string; stderr?: string};
  }
  if (!failure || failure.code === 0) throw new Error('Installed ywtc accepted a Confluence startup HTML page');
  const output = `${failure.stdout ?? ''}\n${failure.stderr ?? ''}`;
  if (!output.includes('unavailable or not fully started') || !output.includes('attachment storage connectivity')) {
    throw new Error(`Installed ywtc provider diagnosis is not actionable: ${output}`);
  }
  if (output.includes('Cannot read properties') || output.includes('<html')) {
    throw new Error(`Installed ywtc exposed an implementation error or raw provider HTML: ${output}`);
  }
  if (providerRequests.some((request) => /\/rest\/api\/content(?:\/|\?|$)/u.test(request))) {
    throw new Error(`Installed ywtc resolved page locators after failed provider preflight: ${providerRequests.join(', ')}`);
  }
  const runtimeEntries = await readdir(path.join(providerFailureWorkspace, '.states'), {recursive: true});
  if (runtimeEntries.some((entry) => entry.endsWith('.json') || entry.endsWith('index.html'))) {
    throw new Error(`Installed ywtc created state or report data after failed provider preflight: ${runtimeEntries.join(', ')}`);
  }
} finally {
  unavailableServer.closeAllConnections();
  await new Promise<void>((resolve, reject) => unavailableServer.close((error) => error ? reject(error) : resolve()));
}

const installedReportModule = path.join(prefix, 'lib', 'node_modules', '@iwonz', 'ywtc', 'dist', 'report.js');
const installedDiagramModule = path.join(prefix, 'lib', 'node_modules', '@iwonz', 'ywtc', 'dist', 'diagrams.js');
process.stdout.write('Verifying packaged diagram extraction and materialization...\n');
const installedDiagramDirectory = path.join(temporary, 'installed-diagram');
await mkdir(installedDiagramDirectory, {recursive: true});
const diagramSmoke = `
  import {readFile} from 'node:fs/promises';
  import {discoverPageDiagrams, materializeEmbeddedDiagram} from ${JSON.stringify(pathToFileURL(installedDiagramModule).toString())};
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><!--' + 'x'.repeat(131072) + '--><text>Package smoke</text></svg>';
  const encoded = Buffer.from(svg).toString('base64');
  const page = {
    provider: 'yandex-wiki', profile: 'wiki', id: '1', canonicalId: 'yandex:wiki:1', title: 'Diagram',
    locator: 'diagram', url: 'https://wiki.example.test/diagram', rawFormat: 'yfm', references: [],
    rawContent: '# Diagram\\n\\n{% drawio data="data:image/svg+xml;base64,' + encoded + '" %}',
  };
  const result = discoverPageDiagrams(page);
  if (result.diagrams.length !== 1 || result.resources.length !== 1 || result.preparedContent.includes(encoded)) {
    throw new Error('Packaged diagram discovery did not isolate the inline payload');
  }
  if (JSON.stringify(result.resources).includes(encoded.slice(0, 256))) {
    throw new Error('Packaged diagram metadata contains inline payload data');
  }
  const output = ${JSON.stringify(path.join(installedDiagramDirectory, 'diagram.drawio.svg'))};
  const materialized = await materializeEmbeddedDiagram(page, result.resources[0], output);
  if (materialized.size !== Buffer.byteLength(svg) || (await readFile(output, 'utf8')) !== svg) {
    throw new Error('Packaged diagram materialization changed the source artifact');
  }
`;
await execFileAsync(process.execPath, ['--input-type=module', '--eval', diagramSmoke], {encoding: 'utf8'});
process.stdout.write('Verifying packaged autonomous report generation...\n');
const installedReportDirectory = path.join(temporary, 'installed-report');
const reportSmoke = `
  import {TransferReport} from ${JSON.stringify(pathToFileURL(installedReportModule).toString())};
  const report = new TransferReport({
    runId: '00000000-0000-4000-8000-000000000008',
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
if (!installedHtml.includes('data:font/woff2;base64,') || /https?:[^\s"')]+\.(?:woff2?|ttf|otf)/iu.test(installedHtml)) {
  throw new Error('Installed package did not embed its autonomous report font');
}
process.stdout.write(`Package verified: ${packResult.filename}\n`);

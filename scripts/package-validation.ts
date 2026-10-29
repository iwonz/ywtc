import {execFile, spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {access, mkdir, mkdtemp, readdir, readFile, stat, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {promisify} from 'node:util';
import {createRequire} from 'node:module';
import {stringify as stringifyYaml} from 'yaml';
import {packRelease} from './release-package.js';

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
const packResult = readPackResult(await packRelease(process.cwd(), temporary));
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
for (const file of packResult.files.filter(file => file.path.startsWith('dist/web/'))) {
  if (file.path.includes('/node_modules/') || file.path.includes('/.next/cache/')) throw Error(`Unexpected web build intermediate: ${file.path}`);
  if (/\.(?:js|json|map)$/.test(file.path) && (await readFile(file.path, 'utf8')).includes(process.cwd())) throw Error(`Non-portable web artifact: ${file.path}`);
}
for (const required of ['dist/report-ui/index.html', 'dist/mentions-ui/index.html', 'dist/web/server.js', 'dist/ui-service.js', 'dist/jobs/worker.js', 'docs/assets/report-header-transparent.png', 'ui/LICENSE']) {
  if (!packResult.files.some((file) => file.path === required)) throw new Error(`Packed archive is missing ${required}`);
}

const prefix = path.join(temporary, 'prefix');
process.stdout.write('Installing packed CLI in an isolated prefix...\n');
await execFileAsync('npm', ['install', '--global', '--ignore-scripts', '--prefix', prefix, archive], {
  cwd: temporary,
  encoding: 'utf8',
  env: npmEnvironment,
});
await execFileAsync('npm', ['ls', '--all', '--omit=dev', '--global', '--prefix', prefix, '--json'], {cwd: temporary, encoding: 'utf8', env: npmEnvironment, maxBuffer: 16 * 1024 * 1024});
const executable = path.join(prefix, 'bin', 'ywtc');
const installedRequire = createRequire(path.join(prefix, 'lib/node_modules/@iwonz/ywtc/package.json'));
if (installedRequire('./package.json').overrides) throw Error('Published package retained root-only override policy');
const rendererRequire = createRequire(installedRequire.resolve('@diplodoc/transform'));
const installedCssPackage = rendererRequire('css/package.json');
const installedCssNamespace = rendererRequire('css');
const installedCss = installedCssNamespace.__esModule ? installedCssNamespace.default : installedCssNamespace;
if (installedCssPackage.name !== '@adobe/css-tools' || typeof installedCss?.parse !== 'function' || typeof installedCss?.stringify !== 'function') {
  throw new Error('Installed renderer did not retain its audited CommonJS-compatible CSS dependency');
}
if (!installedCss.stringify(installedCss.parse('.fixture { color: red; }')).includes('color: red')) {
  throw new Error('Installed renderer CSS API changed stylesheet content');
}
const version = await execFileAsync(executable, ['--version'], {encoding: 'utf8'});
const uiHelp = await execFileAsync(executable, ['ui', '--help'], {encoding: 'utf8'});
if (!uiHelp.stdout.includes('--port') || !uiHelp.stdout.includes('--no-open')) throw Error('Packaged UI help is incomplete');
const jobsHelp = await execFileAsync(executable, ['migrations', '--help'], {encoding: 'utf8'});
if (!jobsHelp.stdout.includes('logs') || !jobsHelp.stdout.includes('stop')) throw Error('Packaged job controls are missing');
const syncHelp=await execFileAsync(executable,['sync','--help'],{encoding:'utf8'});if(!syncHelp.stdout.includes('apply')||!syncHelp.stdout.includes('--source'))throw Error('Packaged synchronization commands are missing');
const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as {version: string};
if (version.stdout.trim() !== packageJson.version) throw new Error('Installed ywtc version does not match package.json');
await execFileAsync(executable, ['--help'], {encoding: 'utf8'});
const initHelp = await execFileAsync(executable, ['init', '--help'], {encoding: 'utf8'});
if (!initHelp.stdout.includes('--interactive') || !initHelp.stdout.includes('TTY wizard')) {
  throw new Error('Installed ywtc init help does not document the interactive TTY wizard');
}
const migrateHelp = await execFileAsync(executable, ['migrate', '--help'], {encoding: 'utf8'});
if (!migrateHelp.stdout.includes('-R, --rewrite')) throw new Error('Installed ywtc migrate help is missing identity-preserving rewrite');
for (const option of [
  '-i, --interactive', '-s, --source', '-d, --destination', '-S, --source-profile', '-D, --destination-profile',
  '-m, --scope', '-t, --source-status', '-C, --comments', '-N, --no-comments', '-f, --format', '-a, --archive',
  '-n, --dry-run', '-F, --fresh', '-o, --open-report', '-j, --concurrency', '-r, --state', '-w, --workdir',
]) {
  if (!migrateHelp.stdout.includes(option)) throw new Error(`Installed ywtc migrate help is missing ${option}`);
}
const retryHelp = await execFileAsync(executable, ['retry', '--help'], {encoding: 'utf8'});
if (!retryHelp.stdout.includes('-R, --rewrite')) throw new Error('Installed ywtc retry help is missing identity-preserving rewrite');
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
  if (runtimeEntries.some((entry) => !entry.startsWith(`jobs${path.sep}`) && (entry.endsWith('.json') || entry.endsWith('index.html')))) {
    throw new Error(`Installed ywtc created state or report data after failed provider preflight: ${runtimeEntries.join(', ')}`);
  }
  const jobs = await execFileAsync(executable, ['migrations', 'list', '--all', '-w', providerFailureWorkspace], {encoding: 'utf8'});
  if (!jobs.stdout.includes('finished')) throw new Error('Failed provider preflight did not retain a completed job result');
} finally {
  unavailableServer.closeAllConnections();
  await new Promise<void>((resolve, reject) => unavailableServer.close((error) => error ? reject(error) : resolve()));
}

const installedReportModule = path.join(prefix, 'lib', 'node_modules', '@iwonz', 'ywtc', 'dist', 'report.js');
const installedDiagramModule = path.join(prefix, 'lib', 'node_modules', '@iwonz', 'ywtc', 'dist', 'diagrams.js');
const installedConfigModule = path.join(prefix, 'lib', 'node_modules', '@iwonz', 'ywtc', 'dist', 'config.js');
const installedContentModule = path.join(prefix, 'lib', 'node_modules', '@iwonz', 'ywtc', 'dist', 'content-model.js');
const installedMentionModule = path.join(prefix, 'lib', 'node_modules', '@iwonz', 'ywtc', 'dist', 'mentions.js');
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
process.stdout.write('Verifying packaged mention configuration and rendering...\n');
const mentionSmoke = `
  import {parseWorkspaceConfig} from ${JSON.stringify(pathToFileURL(installedConfigModule).toString())};
  import {normalizePageContent, renderConfluenceStorage} from ${JSON.stringify(pathToFileURL(installedContentModule).toString())};
  import {resolveMentionPresentations} from ${JSON.stringify(pathToFileURL(installedMentionModule).toString())};
  const config = parseWorkspaceConfig({
    mentions: {mode: 'mapping', mappingFile: './decisions.json'},
    connections: {
      wiki: {
        type: 'yandex-wiki', apiUrl: 'https://api.wiki.yandex.net/v1', webUrl: 'https://wiki.example',
        authType: 'oauth', token: 'package-smoke-token', organization: {type: 'yandex360', id: 'organization'},
      },
    },
  }, '/tmp/package-smoke-ywtc.config.yaml');
  const page = {
    provider: 'yandex-wiki', profile: 'wiki', id: '1', canonicalId: 'wiki:1', title: 'Mention',
    locator: 'mention', url: 'https://wiki.example/mention', rawFormat: 'yfm', references: [], rawContent: 'Hello @{ivan}',
  };
  const document = normalizePageContent(page);
  const policy = {mode: 'mapping', document: {source: {provider: 'yandex-wiki', instance: 'https://wiki.example'}, entries: [{identity: {username: 'ivan'}, mention: '@ivan', decision: 'url', url: 'https://people.example/ivan'}]}};
  const presentations = await resolveMentionPresentations(document.mentions ?? [], policy);
  const rendered = await renderConfluenceStorage(document, page, {
    pages: new Map(), resources: new Map(), sourcePages: new Map([[page.canonicalId, page]]),
    currentPageId: page.canonicalId, mentions: presentations,
  }, 'DOC');
  if (!rendered.body.includes('https://people.example/ivan') || rendered.mentions?.linked !== 1) {
    throw new Error('Packaged mention decision did not survive normalization and rendering');
  }
`;
await execFileAsync(process.execPath, ['--input-type=module', '--eval', mentionSmoke], {encoding: 'utf8'});
process.stdout.write('Verifying packaged source-only mention export and mapping acceptance...\n');
const mentionsWorkspace = path.join(temporary, 'mentions-workspace');
await mkdir(mentionsWorkspace);
const mentionsRequests: string[] = [];
const mentionsServer = createServer((request, response) => {
  mentionsRequests.push(`${request.method} ${request.url}`);
  response.setHeader('Content-Type', 'application/json');
  if (request.url?.startsWith('/rest/api/settings/systemInfo')) response.end(JSON.stringify({version: '9.5.2'}));
  else if (request.url?.startsWith('/rest/api/space/~user/content/page')) response.end(JSON.stringify({results: ['1', '2'].map(id => ({id, type: 'page', title: `Personal ${id}`, status: 'current', space: {id: '7', key: '~user'}, version: {number: 1}, ancestors: [], body: {storage: {value: `<p>Hello <ac:link><ri:user ri:username="user${id}"/></ac:link></p>`, representation: 'storage'}}}))}));
  else if (request.url?.startsWith('/rest/api/space/~user')) response.end(JSON.stringify({id: '7', key: '~user', name: 'Personal notes'}));
  else if (request.url?.startsWith('/rest/api/content/1')) response.end(JSON.stringify({id: '1', type: 'page', title: 'Mentions', status: 'current', space: {key: 'DOC'}, version: {number: 1}, ancestors: [], body: {storage: {value: '<p>Hello #topic <ac:link><ri:user ri:username="ivan"/></ac:link></p>', representation: 'storage'}}, _links: {webui: '/pages/1'}}));
  else {response.statusCode = 500;response.end(JSON.stringify({message: 'Unexpected endpoint in source-only export'}));}
});
await new Promise<void>(resolve => mentionsServer.listen(0, '127.0.0.1', resolve));
try {
  const address = mentionsServer.address();if (!address || typeof address === 'string') throw new Error('Missing fixture address');
  const instance = `http://127.0.0.1:${address.port}`;
  const configPath = path.join(mentionsWorkspace, 'ywtc.config.yaml');
  await writeFile(configPath, stringifyYaml({hashtags: {mode: 'mapping', mappingFile: './does-not-exist.json'}, mentions: {mode: 'mapping', mappingFile: './does-not-exist.json'}, connections: {source: {type: 'confluence', deployment: 'data-center', baseUrl: instance, authType: 'pat', token: 'package-smoke-token'}}}), {mode: 0o600});
  const output = path.join(temporary, 'installed-mentions');
  const exported = await execFileAsync(executable, ['mentions', 'export', '-s', '1', '-S', 'source', '-m', 'page', '-N', '-w', mentionsWorkspace, '-o', output], {encoding: 'utf8'});
  if (!exported.stdout.includes('file://') || !exported.stdout.includes('complete')) throw new Error('Packaged export did not print editor paths and completeness');
  const decisions = JSON.parse(await readFile(path.join(output, 'decisions.json'), 'utf8'));
  if (decisions.entries.length !== 1 || decisions.entries[0].decision !== 'skip') throw new Error('Packaged export did not initialize decisions');
  const editor = await readFile(path.join(output, 'index.html'), 'utf8');
  if (!editor.includes('ywtc-mentions-data') || /<script[^>]+src=/.test(editor) || editor.includes('{"__ywtc_mentions_payload__":true}')) throw new Error('Packaged editor is not autonomous');
  const installedPolicyModule = path.join(path.dirname(installedConfigModule), 'mention-policy.js');
  const accept = `import {readWorkspaceConfig} from ${JSON.stringify(pathToFileURL(installedConfigModule).toString())};import {loadMentionPolicy} from ${JSON.stringify(pathToFileURL(installedPolicyModule).toString())};const config = readWorkspaceConfig(${JSON.stringify(configPath)});config.mentions = {mode: 'mapping', mappingFile: ${JSON.stringify(path.join(output, 'decisions.json'))}};if (loadMentionPolicy(config, config.profiles.source).document.entries.length !== 1) throw Error('Mapping rejected');`;
  await execFileAsync(process.execPath, ['--input-type=module', '--eval', accept], {encoding: 'utf8'});
  if (mentionsRequests.some(value => !value.startsWith('GET ') || /attachment|grid|comment/.test(value))) throw new Error(`Export used non-source endpoints: ${mentionsRequests.join(', ')}`);
  const runtime = await readdir(path.join(mentionsWorkspace, '.states'), {recursive: true});if (runtime.some(file => !file.startsWith(`jobs${path.sep}`) && file.endsWith('.json'))) throw new Error('Mentions export mutated migration mappings or checkpoints');
  const hashtagOutput = path.join(temporary, 'installed-hashtags');
  const hashtagExport = await execFileAsync(executable, ['hashtags', 'export', '-s', '1', '-S', 'source', '-m', 'page', '-N', '-w', mentionsWorkspace, '-o', hashtagOutput], {encoding: 'utf8'});
  const hashtagDocument = JSON.parse(await readFile(path.join(hashtagOutput, 'decisions.json'), 'utf8'));
  if (!hashtagExport.stdout.includes('file://') || hashtagDocument.entries.length !== 1 || hashtagDocument.entries[0].tag !== '#topic') throw new Error('Packaged hashtag export failed');
  const hashtagEditor = await readFile(path.join(hashtagOutput, 'index.html'), 'utf8');
  if (!hashtagEditor.includes('data-kind="hashtags"') || /<script[^>]+src=/.test(hashtagEditor)) throw new Error('Packaged hashtag editor is not autonomous');
  const acceptHashtags = `import {readWorkspaceConfig} from ${JSON.stringify(pathToFileURL(installedConfigModule).toString())};import {loadHashtagPolicy} from ${JSON.stringify(pathToFileURL(path.join(path.dirname(installedConfigModule), 'hashtag-policy.js')).toString())};const config = readWorkspaceConfig(${JSON.stringify(configPath)});config.hashtags = {mode:'mapping',mappingFile:${JSON.stringify(path.join(hashtagOutput, 'decisions.json'))}};if (loadHashtagPolicy(config, config.profiles.source).document.entries[0].tag !== '#topic') throw Error('Hashtag mapping rejected');`;
  await execFileAsync(process.execPath, ['--input-type=module', '--eval', acceptHashtags], {encoding: 'utf8'});
  const spaceOutput = path.join(temporary, 'installed-personal-mentions');
  await execFileAsync(executable, ['mentions', 'export', '-s', `${instance}/spaces/viewspace.action?key=~user`, '-N', '-w', mentionsWorkspace, '-o', spaceOutput], {encoding: 'utf8'});
  const personal = JSON.parse(await readFile(path.join(spaceOutput, 'decisions.json'), 'utf8'));
  if (personal.entries.length !== 2 || personal.inventory.selectedPages !== 2 || !personal.inventory.complete) throw new Error('Packaged personal space export omitted an independent branch or counted its container');
  if (mentionsRequests.some(value => !value.startsWith('GET ') || /attachment|grid|comment|content\/space/.test(value))) throw new Error('Packaged personal export crossed its source-only boundary');
  const personalRuntime = await readdir(path.join(mentionsWorkspace, '.states'), {recursive: true});if (personalRuntime.some(file => !file.startsWith(`jobs${path.sep}`) && file.endsWith('.json'))) throw new Error('Personal mention export mutated migration mappings or checkpoints');
} finally {await new Promise<void>((resolve, reject) => mentionsServer.close(error => error ? reject(error) : resolve()));}
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
process.stdout.write('Verifying installed local UI, authentication, and detached analysis...\n');
const portProbe = createServer();
await new Promise<void>(resolve => portProbe.listen(0, '127.0.0.1', resolve));
const uiPort = (portProbe.address() as {port: number}).port;
await new Promise<void>(resolve => portProbe.close(() => resolve()));
const uiWorkdir = path.join(temporary, 'installed-ui');await mkdir(uiWorkdir);
const apiFixture = createServer((_request, response) => {response.setHeader('content-type', 'application/json');response.end(JSON.stringify({id: 1, slug: 'page', title: 'Packaged page', page_type: 'page', content: 'Hello @ivan #topic'}));});
await new Promise<void>(resolve => apiFixture.listen(0, '127.0.0.1', resolve));
const apiPort = (apiFixture.address() as {port: number}).port;
await writeFile(path.join(uiWorkdir, 'ywtc.config.yaml'), JSON.stringify({connections: {wiki: {type: 'yandex-wiki', webUrl: 'https://wiki.example.com', apiUrl: `http://127.0.0.1:${apiPort}`, token: 'package-fixture-token', organization: {id: '1'}}}}));
const ui = spawn(executable, ['ui', '--no-open', '--port', String(uiPort), '--workdir', uiWorkdir], {cwd: temporary, stdio: ['ignore', 'pipe', 'pipe']});
let startup = '', uiErrors = '';ui.stdout.on('data', data => {startup += data;});ui.stderr.on('data', data => {uiErrors += data;});
try {
  for (let attempt = 0; attempt < 200 && !startup.includes('/#'); attempt++) {if (ui.exitCode !== null) throw Error(`Packaged UI exited: ${uiErrors}`);await new Promise(resolve => setTimeout(resolve, 100));}
  const url = startup.match(/http:\/\/127\.0\.0\.1:\d+\/#([a-f0-9]+)/)?.[0];if (!url) throw Error(`Packaged UI did not become ready: ${uiErrors}`);
  const address = new URL(url), origin = address.origin;
  const session = await fetch(`${origin}/api/session`, {method: 'POST', headers: {origin, 'content-type': 'application/json'}, body: JSON.stringify({secret: address.hash.slice(1)})});
  if (!session.ok) throw Error(`Packaged UI authentication failed: ${await session.text()}`);
  const cookie = session.headers.get('set-cookie')!.split(';')[0]!;
  const settings = await fetch(`${origin}/api/workspaces`, {headers: {cookie}}).then(r => r.json()) as {items: Array<{id: string}>};
  const workspaceId = settings.items[0]!.id;
  const html = await fetch(origin).then(r => r.text());if (!html.includes('ywtc')) throw Error('Packaged UI did not render');
  const submitted = await fetch(`${origin}/api/w/${workspaceId}/jobs`, {method: 'POST', headers: {origin, cookie, 'content-type': 'application/json'}, body: JSON.stringify({request: {kind: 'scan', source: 'page', scope: 'page', sourceStatus: 'all', comments: false, kinds: ['mentions', 'hashtags']}})});
  const job = await submitted.json() as {id: string};if (!submitted.ok) throw Error(`Packaged submission failed: ${JSON.stringify(job)}`);
  ui.kill('SIGTERM');
  for (let attempt = 0; attempt < 200; attempt++) {
    const result = await execFileAsync(executable, ['migrations', 'show', job.id, '--json', '-w', uiWorkdir], {encoding: 'utf8'}).then(r => JSON.parse(r.stdout));
    if (result.status === 'finished') {if (result.result?.exitCode !== 0) throw Error(`Packaged detached operation failed: ${result.error}`);break;}
    if (attempt === 199) throw Error('Packaged background operation did not finish after UI closed');await new Promise(resolve => setTimeout(resolve, 100));
  }
} finally {ui.kill('SIGTERM');apiFixture.closeAllConnections();await new Promise<void>(resolve => apiFixture.close(() => resolve()));}
process.stdout.write('Verifying installed synchronization analysis and managed expansion...\n');
const syncWorkdir=path.join(temporary,'installed-sync');await mkdir(syncWorkdir);let expandedAccess=false;
const syncRequests:string[]=[],syncPage=(id:string)=>({id,type:'page',title:id==='1'?'Root':'New page',status:'current',space:{key:'DOC'},version:{number:1},ancestors:id==='1'?[]:[{id:'1'}],body:{storage:{value:`<p>${id==='1'?'Root body':'New body'}</p>`,representation:'storage'}},_links:{webui:`/pages/${id}`}});
const syncServer=createServer((request,response)=>{syncRequests.push(`${request.method} ${request.url}`);const url=new URL(request.url!,'http://example.test');response.setHeader('content-type','application/json');if(url.pathname==='/rest/api/settings/systemInfo')response.end(JSON.stringify({version:'9.5.2'}));else if(url.pathname.endsWith('/child/attachment'))response.end(JSON.stringify({results:[],size:0}));else if(url.pathname.endsWith('/descendant/page'))response.end(JSON.stringify({results:expandedAccess?[syncPage('2')]:[],size:expandedAccess?1:0}));else if(/^\/rest\/api\/content\/[12]$/.test(url.pathname))response.end(JSON.stringify(syncPage(url.pathname.endsWith('/1')?'1':'2')));else{response.statusCode=404;response.end(JSON.stringify({message:'Unexpected synchronization fixture request'}));}});
await new Promise<void>(resolve=>syncServer.listen(0,'127.0.0.1',resolve));
try{
 const port=(syncServer.address() as {port:number}).port;await writeFile(path.join(syncWorkdir,'ywtc.config.yaml'),stringifyYaml({connections:{source:{type:'confluence',deployment:'data-center',baseUrl:`http://127.0.0.1:${port}`,authType:'pat',token:'package-fixture-token'}}}),{mode:0o600});
 const output=path.join(temporary,'sync-export');const initial=await execFileAsync(executable,['migrate','-s','1','-d',output,'-f','markdown','-N','-w',syncWorkdir],{encoding:'utf8'}),runId=initial.stdout.match(/Run ID\s+([a-f0-9-]{36})/)?.[1];if(!runId)throw Error('Installed migration did not return a Run ID');
 expandedAccess=true;const analysis=await execFileAsync(executable,['sync',runId,'-w',syncWorkdir],{encoding:'utf8'}),planId=analysis.stdout.match(/Plan ID\s+([a-f0-9-]{36})/)?.[1];if(!planId)throw Error('Installed synchronization did not persist a plan');
 const applied=await execFileAsync(executable,['sync','apply',planId,'-w',syncWorkdir],{encoding:'utf8'});if(!applied.stdout.includes('file://'))throw Error('Installed synchronization did not return a report');
 const manifest=JSON.parse(await readFile(path.join(output,'.ywtc-export.json'),'utf8'));if(manifest.pages.length!==2||manifest.pages.find((p:any)=>p.sourceCanonicalId==='source:confluence:1')?.path!=='index.md')throw Error('Installed synchronization changed established paths or lost added pages');if(syncRequests.some(method=>!method.startsWith('GET ')))throw Error('Filesystem sync mutated a provider');
}finally{syncServer.closeAllConnections();await new Promise<void>(resolve=>syncServer.close(()=>resolve()));}
process.stdout.write(`Package verified: ${packResult.filename}\n`);

#!/usr/bin/env node
import {Listr} from 'listr2';
import {cliHelp, parseCliArguments} from './cli-arguments.js';
import {readWorkspaceConfig, secretValues, validateProfileSecrets} from './config.js';
import {resolveDestinationLocator, resolveSourceLocator} from './locators.js';
import {createLogger, redact} from './logger.js';
import type {Migrator} from './migrator.js';
import {runUpdate} from './updater.js';
import {packageVersion} from './version.js';
import {
  initializeWorkspace,
  resolveInitWorkspace,
  resolveWorkspace,
  resolveWorkspacePath,
  workspaceIsInitialized,
} from './workspace.js';

const color = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code: number, value: string) => color ? `\u001b[${code}m${value}\u001b[0m` : value;

function heading(label: string): void {
  console.log(`\n${paint(36, '◆')} ${paint(1, label)}`);
}

async function migrate(command: Extract<ReturnType<typeof parseCliArguments>, {command: 'migrate'}>): Promise<number> {
  const workspace = await resolveWorkspace(command.workdir ? {explicit: command.workdir} : {});
  const initialized = await initializeWorkspace(workspace);
  const config = readWorkspaceConfig(workspace.configFile);
  const secrets = secretValues(config);
  const source = resolveSourceLocator(config, command.source, command.sourceProfile);
  const destination = resolveDestinationLocator({
    config,
    value: command.destination,
    ...(command.destinationProfile ? {profile: command.destinationProfile} : {}),
    ...(command.format ? {format: command.format} : {}),
    cwd: process.cwd(),
  });
  validateProfileSecrets(config, [source.profile, ...(destination.type === 'remote' ? [destination.profile] : [])]);
  const stateFilename = command.stateFilename ? resolveWorkspacePath(workspace, command.stateFilename) : undefined;
  const logger = createLogger(secrets);
  const {Migrator: MigratorImplementation} = await import('./migrator.js');
  const migrator = new MigratorImplementation(config, logger);
  const controller = new AbortController();
  let signalCode: number | undefined;
  const interrupt = () => { signalCode = 130; controller.abort(new Error('Interrupted by SIGINT')); };
  const terminate = () => { signalCode = 143; controller.abort(new Error('Interrupted by SIGTERM')); };
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', terminate);
  heading('ywtc transfer');
  console.log(`  Workdir      ${workspace.root} ${paint(90, `(${workspace.source})`)}`);
  console.log(`  Source       ${command.source} ${paint(90, `[${source.profile.name}]`)}`);
  console.log(`  Destination  ${command.destination}${destination.type === 'remote' ? ` ${paint(90, `[${destination.profile.name}]`)}` : ` ${paint(90, `[${destination.format}]`)}`}`);
  console.log(`  Scope        ${command.scope}`);
  console.log(`  Mode         ${command.dryRun ? paint(33, 'dry-run · read-only') : paint(35, 'live')}`);
  if (initialized.created.length > 0) console.log(`  Initialized  ${initialized.created.join(', ')}`);

  let result: Awaited<ReturnType<Migrator['run']>> | undefined;
  const tasks = new Listr([
    {
      title: 'Discover, transfer, and verify',
      task: async (_context, task) => {
        result = await migrator.run({
          source,
          destination,
          scope: command.scope,
          dryRun: command.dryRun,
          archive: command.archive,
          fresh: command.fresh,
          concurrency: command.concurrency ?? config.concurrency,
          runtimeDirectory: workspace.statesDirectory,
          cacheDirectory: workspace.cacheDirectory,
          reportsDirectory: workspace.reportsDirectory,
          signal: controller.signal,
          ...(stateFilename ? {stateFilename} : {}),
          onStatus: (message) => { task.output = message; },
        });
      },
    },
  ], {
    renderer: process.stdout.isTTY ? 'default' : 'simple',
    rendererOptions: {collapseErrors: false, collapseSubtasks: false},
    collectErrors: true,
  });
  try {
    await tasks.run();
  } catch (error) {
    if (signalCode) {
      heading('Transfer interrupted');
      console.log(`  Status   cancelled by ${signalCode === 130 ? 'SIGINT' : 'SIGTERM'}`);
      console.log(`  Workdir  ${workspace.root}`);
      console.log(`  Reports  ${workspace.reportsDirectory}`);
      console.log(`  Resume   ywtc migrate --source "${command.source}" --destination "${command.destination}" --scope ${command.scope} --workdir "${workspace.root}"`);
      return signalCode;
    }
    throw error;
  } finally {
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', terminate);
  }
  if (!result) throw new Error('Transfer completed without a result');
  heading(result.status === 'completed' ? 'Transfer complete' : 'Transfer finished');
  console.log(`  Status  ${result.status}`);
  console.log(`  State   ${result.stateFilename}`);
  console.log(`  Report  ${result.reportPaths.html}`);
  console.log(`  Pages   ${command.dryRun ? `${result.summary.complete}/${result.summary.pages} planned` : `${result.summary.complete}/${result.summary.pages} complete`} · ${result.summary.partial} partial · ${result.summary.failed} failed`);
  console.log(`  Content ${result.summary.resources} files · ${result.summary.bytes} bytes · ${result.summary.links} links · ${result.summary.cycles} cycles`);
  console.log(`  Issues  ${result.summary.warnings} warnings · ${result.summary.errors} errors`);
  if (result.output) console.log(`  Output  ${result.output}`);
  if (result.archive) console.log(`  Archive ${result.archive}`);
  if (result.hasErrors) console.log(`  Resume  ywtc migrate --source "${command.source}" --destination "${command.destination}" --scope ${command.scope}`);
  return result.hasErrors ? 1 : 0;
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const command = parseCliArguments(argv);
  if (command.command === 'help') {
    console.log(cliHelp(command.topic));
    return 0;
  }
  if (command.command === 'version') {
    console.log(packageVersion());
    return 0;
  }
  if (command.command === 'init') {
    const workspace = resolveInitWorkspace(command.workdir ? {explicit: command.workdir} : {});
    const result = await initializeWorkspace(workspace);
    heading('Workspace ready');
    console.log(`  Path      ${workspace.root}`);
    console.log(`  Config    ${workspace.configFile}`);
    console.log(`  State     ${workspace.statesDirectory}`);
    console.log(`  Created   ${result.created.length ? result.created.join(', ') : 'nothing'}`);
    console.log(`  Reused    ${result.existing.length ? result.existing.join(', ') : 'nothing'}`);
    console.log(`  Next      Fill connection settings and credentials, then run: ywtc doctor --workdir "${workspace.root}"`);
    return 0;
  }
  if (command.command === 'doctor') {
    const workspace = await resolveWorkspace(command.workdir ? {explicit: command.workdir} : {});
    if (!await workspaceIsInitialized(workspace)) {
      throw new Error(`Workspace is not initialized: ${workspace.configFile}. Run: ywtc init --workdir ${JSON.stringify(workspace.root)}.`);
    }
    const config = readWorkspaceConfig(workspace.configFile);
    heading('Workspace diagnosis');
    console.log(`  Workdir   ${paint(32, workspace.root)}`);
    console.log(`  Profiles  ${Object.values(config.profiles).map((profile) => `${profile.name}:${profile.type}`).join(', ')}`);
    console.log(`  Config    ${paint(32, 'valid')} · ${workspace.configFile}`);
    if (!command.source || !command.destination) {
      validateProfileSecrets(config, Object.values(config.profiles));
      console.log(`  API       ${paint(90, 'not requested; pass both --source and --destination')}`);
      return 0;
    }
    const source = resolveSourceLocator(config, command.source, command.sourceProfile);
    const destination = resolveDestinationLocator({
      config,
      value: command.destination,
      ...(command.destinationProfile ? {profile: command.destinationProfile} : {}),
      ...(command.format ? {format: command.format} : {}),
    });
    validateProfileSecrets(config, [source.profile, ...(destination.type === 'remote' ? [destination.profile] : [])]);
    const {runCapabilityDoctor} = await import('./doctor.js');
    const result = await runCapabilityDoctor(config, source, destination, command.scope);
    console.log(`  Source    ${paint(32, `${result.source.product}${result.source.version ? ` ${result.source.version}` : ''}`)} · ${result.source.title}`);
    console.log(`  Dest      ${paint(32, `${result.destination.product}${result.destination.version ? ` ${result.destination.version}` : ''}`)}`);
    console.log(`  Scope     ${result.pages} pages · ${result.links} links`);
    for (const warning of result.warnings) console.log(`  ${paint(33, 'Warning')}   ${warning}`);
    return 0;
  }
  if (command.command === 'update') {
    const result = await runUpdate({currentVersion: packageVersion(), install: command.install, ...(command.via ? {via: command.via} : {})});
    heading('Update status');
    console.log(`  Current  ${result.current}`);
    console.log(`  Latest   ${result.latest}`);
    console.log(`  Channel  ${result.channel}`);
    console.log(`  Status   ${result.installed ? paint(32, 'updated') : result.updateAvailable ? paint(33, 'update available') : paint(32, 'up to date')}`);
    if (!result.installed && result.updateAvailable) console.log(`  Command  ${result.command}`);
    return 0;
  }
  return migrate(command);
}

main().then((code) => { process.exitCode = code; }).catch((error) => {
  console.error(`ERROR ${redact(error, [])}`);
  process.exitCode = 2;
});

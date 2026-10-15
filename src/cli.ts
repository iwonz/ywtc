#!/usr/bin/env node
import {Listr} from 'listr2';
import {cliHelp, parseCliArguments} from './cli-arguments.js';
import {readWorkspaceConfig, secretValues, validateProfileSecrets} from './config.js';
import {resolveDestinationLocator, resolveSourceLocator} from './locators.js';
import {createLogger, redact} from './logger.js';
import type {Migrator} from './migrator.js';
import type {MigrationReportPaths} from './report.js';
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

function reportBearingError(error: unknown): error is Error & {reportPaths: MigrationReportPaths; stateFilename: string} {
  return error instanceof Error
    && typeof (error as {reportPaths?: unknown}).reportPaths === 'object'
    && typeof (error as {stateFilename?: unknown}).stateFilename === 'string';
}

async function printAndMaybeOpenReport(paths: MigrationReportPaths, workdir: string, shouldOpen: boolean): Promise<void> {
  const {openReportFile, reportAccessDetails} = await import('./report-catalog.js');
  const access = reportAccessDetails(paths, workdir);
  console.log(`  Run ID  ${access.runId}`);
  console.log(`  Report  ${access.report}`);
  console.log(`  URL     ${access.url}`);
  console.log(`  Open    ${access.command}`);
  if (!shouldOpen) return;
  try {
    await openReportFile(paths.html);
    console.log(`  Opened  ${access.url}`);
  } catch (error) {
    console.log(`  ${paint(33, 'Warning')} ${error instanceof Error ? error.message : String(error)}`);
  }
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
      if (reportBearingError(error)) await printAndMaybeOpenReport(error.reportPaths, workspace.root, command.openReport);
      console.log(`  Resume   ywtc migrate --source "${command.source}" --destination "${command.destination}" --scope ${command.scope} --workdir "${workspace.root}"`);
      return signalCode;
    }
    if (reportBearingError(error)) {
      heading('Transfer failed');
      console.log(`  Status  failed`);
      console.log(`  State   ${error.stateFilename}`);
      await printAndMaybeOpenReport(error.reportPaths, workspace.root, command.openReport);
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
  await printAndMaybeOpenReport(result.reportPaths, workspace.root, command.openReport);
  console.log(`  Source  ${result.summary.pages} pages · ${result.summary.resources} files · ${result.summary.sourceBytes} known bytes${result.summary.bytesUnknown ? ` · ${result.summary.bytesUnknown} sizes unknown` : ''}`);
  console.log(`  Pages   ${result.summary.complete} complete · ${result.summary.partial} partial · ${result.summary.failed} failed · ${result.summary.blocked} blocked · ${result.summary.conflicts} conflicts · ${result.summary.unprocessedPages} unprocessed`);
  console.log(`  Files   ${result.summary.resourcesComplete} complete · ${result.summary.resourcesPartial} partial · ${result.summary.resourcesFailed} failed · ${result.summary.resourcesPlanned} planned · ${result.summary.bytes} transferred bytes`);
  console.log(`  Content ${result.summary.links} links · ${result.summary.cycles} traversal cycles · inventory ${result.summary.inventoryComplete ? 'complete' : 'incomplete'}`);
  console.log(`  Issues  ${result.summary.errors} errors · ${result.summary.warnings} warnings · ${result.summary.degradations} degradations · ${result.summary.normalizations} safe normalizations`);
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
    if (command.interactive) {
      const [{assertInteractiveTerminal, runInteractiveInit}, {ClackInitPrompter}] = await Promise.all([
        import('./interactive-init.js'),
        import('./init-prompts.js'),
      ]);
      assertInteractiveTerminal(process.stdin.isTTY, process.stdout.isTTY);
      const result = await runInteractiveInit({
        ...(command.workdir ? {workdir: command.workdir} : {}),
        prompter: new ClackInitPrompter(),
      });
      return result.code;
    }
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
  if (command.command === 'reports-list' || command.command === 'reports-open') {
    const workspace = await resolveWorkspace(command.workdir ? {explicit: command.workdir} : {});
    const {listReports, openSelectedReport} = await import('./report-catalog.js');
    if (command.command === 'reports-list') {
      const catalog = await listReports(workspace.reportsDirectory);
      heading('Migration reports');
      console.log(`  Workdir  ${workspace.root}`);
      for (const warning of catalog.warnings) console.log(`  ${paint(33, 'Warning')} ${warning}`);
      if (catalog.reports.length === 0) {
        console.log('  Reports  none');
        return 0;
      }
      for (const report of catalog.reports) {
        const issues = `${report.errors} errors · ${report.warnings} warnings · ${report.degradations} degradations`;
        console.log(`  ${report.runId}  ${report.finishedAt ?? report.startedAt}  ${report.status}`);
        console.log(`    ${report.direction} · ${report.scope} · source ${report.pages} pages · ${report.inventoryComplete ? 'inventory complete' : 'inventory incomplete'}`);
        console.log(`    pages ${report.complete} complete · ${report.partial} partial · ${report.failed} failed · ${report.blocked} blocked · ${report.conflicts} conflicts · ${report.unprocessedPages} unprocessed`);
        console.log(`    files ${report.resourcesComplete}/${report.resources} complete · ${report.resourcesPartial} partial · ${report.resourcesFailed} failed · ${report.resourcesPlanned} planned · ${issues}`);
        console.log(`    ${report.url}`);
      }
      return 0;
    }
    const selected = await openSelectedReport(workspace.reportsDirectory, command.runId);
    heading('Migration report opened');
    for (const warning of selected.warnings) console.log(`  ${paint(33, 'Warning')} ${warning}`);
    console.log(`  Run     ${selected.report.runId}`);
    console.log(`  Report  ${selected.report.html}`);
    console.log(`  URL     ${selected.report.url}`);
    return 0;
  }
  return migrate(command);
}

main().then((code) => { process.exitCode = code; }).catch((error) => {
  console.error(`ERROR ${redact(error, [])}`);
  process.exitCode = 2;
});

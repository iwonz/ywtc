import {Listr} from 'listr2';
import type {CliCommand} from './cli-arguments.js';
import {readWorkspaceConfig, secretValues, validateProfileSecrets} from './config.js';
import {resolveDestinationLocator, resolveSourceLocator} from './locators.js';
import {createLogger} from './logger.js';
import type {TransferResult} from './migrator.js';
import type {MigrationReportPaths} from './report.js';
import {initializeWorkspace, resolveWorkspace, resolveWorkspacePath} from './workspace.js';

export type ParsedMigrationCommand = Extract<CliCommand, {command: 'migrate'}>;
export type ReadyMigrationCommand = Omit<ParsedMigrationCommand, 'source' | 'destination' | 'interactive'> & {
  source: string;
  destination: string;
  interactive?: false;
};

export interface MigrationCommandOutcome {
  code: number;
  result?: TransferResult;
  reportPaths?: MigrationReportPaths;
  workspaceRoot: string;
}

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

async function printAndMaybeOpenReport(
  paths: MigrationReportPaths,
  workdir: string,
  shouldOpen: boolean,
): Promise<void> {
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

export function readyMigrationCommand(command: ParsedMigrationCommand): ReadyMigrationCommand {
  if (!command.source || !command.destination) {
    throw new Error('Migration requires source and destination. Use --interactive to configure them in a TTY wizard.');
  }
  const {interactive: _interactive, ...rest} = command;
  return {...rest, source: command.source, destination: command.destination};
}

export async function runMigrationCommand(command: ReadyMigrationCommand): Promise<MigrationCommandOutcome> {
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
  console.log(`  Source state ${command.sourceStatus}`);
  console.log(`  Comments     ${command.comments ? 'enabled' : 'disabled'}`);
  console.log(`  Mode         ${command.dryRun ? paint(33, 'dry-run · read-only') : paint(35, 'live')}`);
  if (initialized.created.length > 0) console.log(`  Initialized  ${initialized.created.join(', ')}`);

  let result: TransferResult | undefined;
  const tasks = new Listr([
    {
      title: 'Discover, transfer, and verify',
      task: async (_context, task) => {
        result = await migrator.run({
          source,
          destination,
          scope: command.scope,
          sourceStatus: command.sourceStatus,
          comments: command.comments,
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
      console.log(`  Resume   ywtc migrate --source "${command.source}" --destination "${command.destination}" --scope ${command.scope}${command.sourceStatus === 'all' ? '' : ` --source-status ${command.sourceStatus}`} --workdir "${workspace.root}"`);
      return {
        code: signalCode,
        workspaceRoot: workspace.root,
        ...(reportBearingError(error) ? {reportPaths: error.reportPaths} : {}),
      };
    }
    if (reportBearingError(error)) {
      heading('Transfer failed');
      console.log('  Status  failed');
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
  console.log(`  Source  root + ${result.summary.selectedDescendants}/${result.summary.returnedDescendants} descendants · ${result.summary.excludedPages} excluded · depth ${result.summary.maximumDepth}`);
  console.log(`  Assets  ${result.summary.pages} pages · ${result.summary.resources} files · ${result.summary.sourceBytes} known bytes${result.summary.bytesUnknown ? ` · ${result.summary.bytesUnknown} sizes unknown` : ''}`);
  console.log(`  Pages   ${result.summary.complete} complete · ${result.summary.partial} partial · ${result.summary.failed} failed · ${result.summary.blocked} blocked · ${result.summary.conflicts} conflicts · ${result.summary.notStartedPages} not started`);
  console.log(`  Files   ${result.summary.resourcesComplete} complete · ${result.summary.resourcesPartial} partial · ${result.summary.resourcesFailed} failed · ${result.summary.resourcesBlocked} blocked · ${result.summary.resourcesNotStarted} not started${result.summary.resourcesPlanned ? ` · ${result.summary.resourcesPlanned} planned` : ''} · ${result.summary.bytes} transferred bytes`);
  console.log(`  Causes  ${result.summary.rootErrors} root errors · ${result.summary.dependentPages} dependent pages · ${result.summary.dependentFiles} dependent files · ${result.summary.dependentComments} dependent comment archives`);
  console.log(`  Content ${result.summary.links} links · ${result.summary.cycles} traversal cycles · inventory ${result.summary.inventoryComplete ? 'complete' : 'incomplete'}`);
  console.log(`  Comments ${result.summary.comments} entries · ${result.summary.commentThreads} threads · ${result.summary.commentParticipants} participants · ${result.summary.commentAttachments} files · ${result.summary.commentBytes} bytes`);
  console.log(`  Quality ${result.summary.errors} errors · ${result.summary.warnings} warnings · ${result.summary.degradations} degradations · ${result.summary.adaptations} adaptations · ${result.summary.normalizations} safe normalizations · ${result.summary.preservedExternalReferences} external references preserved`);
  if (result.output) console.log(`  Output  ${result.output}`);
  if (result.archive) console.log(`  Archive ${result.archive}`);
  if (result.hasErrors) console.log(`  Resume  ywtc migrate --source "${command.source}" --destination "${command.destination}" --scope ${command.scope}${command.sourceStatus === 'all' ? '' : ` --source-status ${command.sourceStatus}`}`);
  return {
    code: result.hasErrors ? 1 : 0,
    result,
    reportPaths: result.reportPaths,
    workspaceRoot: workspace.root,
  };
}

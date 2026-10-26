import {Listr} from 'listr2';
import type {CliCommand} from './cli-arguments.js';
import {readWorkspaceConfig, secretValues, validateProfileSecrets} from './config.js';
import {resolveDestinationLocator, resolveSourceLocator} from './locators.js';
import {createLogger} from './logger.js';
import type {TransferResult} from './migrator.js';
import type {MigrationReportPaths} from './report.js';
import type {RetryExecution} from './retry-plan.js';
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

export function progressHeartbeatInterval(interactiveTerminal: boolean): number {
  return interactiveTerminal ? 2_500 : 15_000;
}

function heading(label: string): void {
  console.log(`\n${paint(36, '◆')} ${paint(1, label)}`);
}

function summaryField(label: string, value: string): void {
  console.log(`  ${label.padEnd(12)}  ${value}`);
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
  summaryField('Run ID', access.runId);
  summaryField('Report', access.report);
  summaryField('URL', access.url);
  summaryField('Open', access.command);
  if (!shouldOpen) return;
  try {
    await openReportFile(paths.html);
    summaryField('Opened', access.url);
  } catch (error) {
    summaryField('Warning', paint(33, error instanceof Error ? error.message : String(error)));
  }
}

export function readyMigrationCommand(command: ParsedMigrationCommand): ReadyMigrationCommand {
  if (!command.source || !command.destination) {
    throw new Error('Migration requires source and destination. Use --interactive to configure them in a TTY wizard.');
  }
  const {interactive: _interactive, ...rest} = command;
  return {...rest, source: command.source, destination: command.destination};
}

function shellRetryCommand(rootRunId: string, workdir: string): string {
  return `ywtc retry ${rootRunId} --workdir ${JSON.stringify(workdir)}`;
}

function resumeCommand(command: ReadyMigrationCommand, workdir: string, retry?: RetryExecution): string {
  if (retry) return shellRetryCommand(retry.rootRunId, workdir);
  return [
    'ywtc migrate',
    `--source ${JSON.stringify(command.source)}`,
    `--destination ${JSON.stringify(command.destination)}`,
    `--scope ${command.scope}`,
    ...(command.sourceStatus === 'all' ? [] : [`--source-status ${command.sourceStatus}`]),
    ...(command.sourceProfile ? [`--source-profile ${JSON.stringify(command.sourceProfile)}`] : []),
    ...(command.destinationProfile ? [`--destination-profile ${JSON.stringify(command.destinationProfile)}`] : []),
    ...(command.format ? [`--format ${command.format}`] : []),
    ...(command.archive ? ['--archive'] : []),
    ...(command.dryRun ? ['--dry-run'] : []),
    ...(command.rewrite ? ['--rewrite'] : []),
    ...(command.comments ? [] : ['--no-comments']),
    ...(command.stateFilename ? [`--state ${JSON.stringify(command.stateFilename)}`] : []),
    `--workdir ${JSON.stringify(workdir)}`,
  ].join(' ');
}

export function migrationContinuationCommand(
  command: ReadyMigrationCommand,
  workdir: string,
  reportRunId?: string,
  retry?: RetryExecution,
): string {
  if (!command.dryRun && reportRunId) return shellRetryCommand(retry?.rootRunId ?? reportRunId, workdir);
  return resumeCommand(command, workdir, retry);
}

export async function runMigrationCommand(command: ReadyMigrationCommand, retry?: RetryExecution): Promise<MigrationCommandOutcome> {
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
  heading(retry ? 'ywtc targeted retry' : 'ywtc transfer');
  console.log(`  Workdir      ${workspace.root} ${paint(90, `(${workspace.source})`)}`);
  console.log(`  Source       ${command.source} ${paint(90, `[${source.profile.name}]`)}`);
  console.log(`  Destination  ${command.destination}${destination.type === 'remote' ? ` ${paint(90, `[${destination.profile.name}]`)}` : ` ${paint(90, `[${destination.format}]`)}`}`);
  console.log(`  Scope        ${command.scope}`);
  console.log(`  Source state ${command.sourceStatus}`);
  console.log(`  Comments     ${command.comments ? 'enabled' : 'disabled'}`);
  console.log(`  Mode         ${command.dryRun ? paint(33, 'dry-run · read-only') : paint(35, 'live')}`);
  if (command.rewrite) console.log('  Rewrite      existing destination IDs only · no page creation');
  if (retry) {
    console.log(`  Retry root   ${retry.rootRunId}`);
    console.log(`  Previous run ${retry.parentRunId}`);
    console.log(`  Attempt      ${retry.attempt}`);
    console.log(`  Selected     ${retry.plan.retryPageIds.length} pages · ${Object.values(retry.plan.selectedResourceIds).flat().length} files · ${retry.plan.selectedCommentPageIds.length} comment archives`);
    console.log(`  Context      ${retry.plan.contextPageIds.length} ancestor pages`);
  }
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
          ...(command.rewrite ? {rewrite: true} : {}),
          concurrency: command.concurrency ?? config.concurrency,
          runtimeDirectory: workspace.statesDirectory,
          cacheDirectory: workspace.cacheDirectory,
          reportsDirectory: workspace.reportsDirectory,
          signal: controller.signal,
          progressHeartbeatMs: progressHeartbeatInterval(Boolean(process.stdout.isTTY)),
          ...(stateFilename ? {stateFilename} : {}),
          ...(retry ? {retry} : {}),
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
      summaryField('Status', `cancelled by ${signalCode === 130 ? 'SIGINT' : 'SIGTERM'}`);
      summaryField('Workdir', workspace.root);
      summaryField('Reports', workspace.reportsDirectory);
      if (reportBearingError(error)) await printAndMaybeOpenReport(error.reportPaths, workspace.root, command.openReport);
      summaryField('Resume', migrationContinuationCommand(command, workspace.root, reportBearingError(error) ? error.reportPaths.runId : undefined, retry));
      return {
        code: signalCode,
        workspaceRoot: workspace.root,
        ...(reportBearingError(error) ? {reportPaths: error.reportPaths} : {}),
      };
    }
    if (reportBearingError(error)) {
      heading('Transfer failed');
      summaryField('Status', 'failed');
      summaryField('State', error.stateFilename);
      await printAndMaybeOpenReport(error.reportPaths, workspace.root, command.openReport);
      summaryField('Resume', migrationContinuationCommand(command, workspace.root, error.reportPaths.runId, retry));
    }
    throw error;
  } finally {
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', terminate);
  }
  if (!result) throw new Error('Transfer completed without a result');
  heading(result.status === 'completed' ? 'Transfer complete' : 'Transfer finished');
  summaryField('Status', result.status);
  summaryField('State', result.stateFilename);
  await printAndMaybeOpenReport(result.reportPaths, workspace.root, command.openReport);

  console.log();
  summaryField('Source', `${result.sourceKind === 'space' ? 'space ·' : 'root +'} ${result.summary.selectedDescendants}/${result.summary.returnedDescendants} ${result.sourceKind === 'space' ? 'pages' : 'descendants'} · ${result.summary.excludedPages} excluded · depth ${result.summary.maximumDepth}`);
  summaryField('Assets', `${result.summary.pages} pages · ${result.summary.resources} files · ${result.summary.sourceBytes} known bytes${result.summary.bytesUnknown ? ` · ${result.summary.bytesUnknown} sizes unknown` : ''}`);
  summaryField('Content', `${result.summary.links} links${result.summary.diagrams ? ` · ${result.summary.diagrams} diagrams` : ''} · ${result.summary.cycles} traversal cycles · inventory ${result.summary.inventoryComplete ? 'complete' : 'incomplete'}`);
  if (result.summary.grids > 0) {
    const gridStatuses = result.summary.gridStatuses
      ? Object.entries(result.summary.gridStatuses).filter(([, count]) => count > 0).map(([status, count]) => `${count} ${status}`).join(' · ')
      : `${result.summary.gridsComplete ?? 0} complete · ${result.summary.gridsFailed ?? 0} failed`;
    summaryField('Grids', gridStatuses);
  }
  if (result.summary.inventoryReusedPages || result.summary.inventoryRecoveryAttempts || result.summary.inventoryRemainingFailures) {
    summaryField('Inventory', `${result.summary.inventoryReusedPages ?? 0} reused · ${result.summary.inventoryFreshPages ?? 0} fresh · ${result.summary.inventoryRecoveryAttempts ?? 0} recovery attempts${result.summary.inventoryRemainingFailures ? ` · ${result.summary.inventoryRemainingFailures} remaining failures` : ''}`);
  }

  console.log();
  summaryField('Pages', `${result.summary.complete} complete · ${result.summary.partial} partial · ${result.summary.failed} failed · ${result.summary.blocked} blocked · ${result.summary.conflicts} conflicts · ${result.summary.notStartedPages} not started`);
  summaryField('Files', `${result.summary.resourcesComplete} complete · ${result.summary.resourcesPartial} partial · ${result.summary.resourcesFailed} failed · ${result.summary.resourcesBlocked} blocked · ${result.summary.resourcesNotStarted} not started${result.summary.resourcesPlanned ? ` · ${result.summary.resourcesPlanned} planned` : ''} · ${result.summary.bytes} transferred bytes`);
  summaryField('Comments', `${result.summary.comments} entries · ${result.summary.commentThreads} threads · ${result.summary.commentParticipants} participants · ${result.summary.commentAttachments} files · ${result.summary.commentBytes} bytes`);
  if ((result.summary.mentionOutcomes?.total ?? 0) > 0) {
    const mentions = result.summary.mentionOutcomes!;
    const outcomes = [
      [mentions.native, 'native'], [mentions.linked, 'linked'], [mentions.text, 'text'],
      [mentions.preserved, 'preserved'], [mentions.unresolved, 'unresolved'], [mentions.failed, 'failed'],
    ].filter(([count]) => Number(count) > 0).map(([count, label]) => `${count} ${label}`).join(' · ');
    const locations = [
      [result.summary.pageMentions ?? 0, 'page'],
      [result.summary.commentMentions ?? 0, 'comment'],
    ].filter(([count]) => Number(count) > 0).map(([count, label]) => `${count} ${label}`).join(' · ');
    summaryField('Mentions', `${result.summary.mentionMode ?? 'off'} · ${mentions.total} total / ${result.summary.mentionIdentities ?? 0} identities${locations ? ` · ${locations}` : ''}${outcomes ? ` · ${outcomes}` : ''}`);
  }

  console.log();
  if (result.summary.hashtags?.total) {
    const tags = result.summary.hashtags;
    const outcomes = (['preserved', 'text', 'linked'] as const).filter(key => tags[key] > 0).map(key => `${tags[key]} ${key}`).join(' · ');
    summaryField('Hashtags', `${tags.mode} · ${tags.total} occurrences / ${tags.unique} tags · ${outcomes}${tags.verified > 0 ? ` · ${tags.verified} verified` : ''}`);
  }
  summaryField('Causes', `${result.summary.rootErrors} root errors · ${result.summary.dependentPages} dependent pages · ${result.summary.dependentFiles} dependent files · ${result.summary.dependentComments} dependent comment archives`);
  summaryField('Quality', `${result.summary.errors} errors · ${result.summary.warnings} warnings · ${result.summary.degradations} degradations · ${result.summary.adaptations} adaptations · ${result.summary.normalizations} safe normalizations · ${result.summary.preservedExternalReferences} external references preserved`);

  if (result.output || result.archive || retry || result.hasErrors) console.log();
  if (result.output) summaryField('Output', result.output);
  if (result.archive) summaryField('Archive', result.archive);
  let retryIncomplete = false;
  if (retry) {
    const remainingRetryable = result.retry?.remainingRetryable ?? result.summary.retryableFailures;
    const remainingTerminal = result.retry?.remainingTerminal ?? Math.max(0,
      result.summary.partial + result.summary.failed + result.summary.blocked + result.summary.conflicts - remainingRetryable,
    );
    summaryField('Retry root', retry.rootRunId);
    summaryField('Previous run', retry.parentRunId);
    summaryField('Remaining', `${remainingRetryable} retryable · ${remainingTerminal} terminal`);
    retryIncomplete = remainingRetryable > 0 || remainingTerminal > 0;
  }
  if (result.hasErrors || retryIncomplete) {
    const continuation = migrationContinuationCommand(command, workspace.root, result.reportPaths.runId, retry);
    summaryField(retry ? 'Next' : 'Retry', continuation);
  }
  return {
    code: result.hasErrors || retryIncomplete ? 1 : 0,
    result,
    reportPaths: result.reportPaths,
    workspaceRoot: workspace.root,
  };
}

import type {CliCommand} from './cli-arguments.js';
import type {TransferResult} from './migrator.js';
import type {MigrationReportPaths} from './report.js';
import type {RetryExecution} from './retry-plan.js';

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
  const {runManagedMigration} = await import('./jobs/command.js');
  return runManagedMigration(command, retry);
}

export async function presentMigrationResult(result: TransferResult, command: ReadyMigrationCommand, workspaceRoot: string, retry?: RetryExecution): Promise<MigrationCommandOutcome> {
  const workspace = {root: workspaceRoot};
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

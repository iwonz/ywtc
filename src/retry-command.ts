import path from 'node:path';
import {pathToFileURL} from 'node:url';
import type {CliCommand} from './cli-arguments.js';
import {runMigrationCommand, type ReadyMigrationCommand} from './migration-command.js';
import {openReportFile, reportOpenCommand} from './report-catalog.js';
import {buildRetryPlan, type RetryExecution} from './retry-plan.js';
import {resolveRetryBaseline} from './retry-report.js';
import {resolveWorkspace, workspaceIsInitialized} from './workspace.js';

type RetryCliCommand = Extract<CliCommand, {command: 'retry'}>;

const color = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code: number, value: string) => color ? `\u001b[${code}m${value}\u001b[0m` : value;

function heading(label: string): void {
  console.log(`\n${paint(36, '◆')} ${paint(1, label)}`);
}

export async function runRetryCommand(command: RetryCliCommand): Promise<number> {
  const workspace = await resolveWorkspace(command.workdir ? {explicit: command.workdir} : {});
  if (!await workspaceIsInitialized(workspace)) {
    throw new Error(`Workspace is not initialized: ${workspace.configFile}. Run: ywtc init --workdir ${JSON.stringify(workspace.root)}.`);
  }
  const baseline = await resolveRetryBaseline(workspace.reportsDirectory, command.runId, workspace.root);
  const plan = buildRetryPlan(baseline.baseline);
  const latestHtml = path.join(workspace.reportsDirectory, baseline.baseline.runId, 'index.html');
  const latestUrl = pathToFileURL(latestHtml).href;

  if (plan.remainingRetryable === 0 && !plan.discoveryIncomplete) {
    const incomplete = plan.remainingTerminal > 0
      || baseline.baseline.summary.partial > 0
      || baseline.baseline.summary.failed > 0
      || baseline.baseline.summary.blocked > 0
      || baseline.baseline.summary.conflicts > 0
      || (baseline.baseline.summary.notStartedPages ?? 0) > 0;
    heading(incomplete ? 'No automatically retryable work remains' : 'Migration is already complete');
    console.log(`  Retry root  ${baseline.rootRunId}`);
    console.log(`  Latest run  ${baseline.baseline.runId}`);
    console.log(`  Terminal    ${plan.remainingTerminal}`);
    console.log(`  Report      ${latestHtml}`);
    console.log(`  URL         ${latestUrl}`);
    console.log(`  Open        ${reportOpenCommand(baseline.baseline.runId, workspace.root)}`);
    if (command.openReport) {
      try {
        await openReportFile(latestHtml);
      } catch (error) {
        console.log(`  ${paint(33, 'Warning')} ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return incomplete ? 1 : 0;
  }

  const invocation = baseline.invocation;
  const ready: ReadyMigrationCommand = {
    command: 'migrate',
    source: invocation.source.locator,
    destination: invocation.destination.type === 'directory' ? invocation.destination.path : invocation.destination.locator,
    sourceProfile: invocation.source.profile,
    ...(invocation.destination.type === 'remote' ? {destinationProfile: invocation.destination.profile} : {format: invocation.destination.format}),
    scope: invocation.scope,
    sourceStatus: invocation.sourceStatus,
    comments: invocation.comments,
    archive: invocation.archive,
    workdir: workspace.root,
    dryRun: command.dryRun,
    fresh: false,
    ...(command.concurrency !== undefined ? {concurrency: command.concurrency} : {}),
    stateFilename: invocation.state.path,
    openReport: command.openReport,
  };
  const retry: RetryExecution = {
    rootRunId: baseline.rootRunId,
    parentRunId: baseline.baseline.runId,
    attempt: baseline.attempt,
    baseline: baseline.baseline,
    plan,
  };
  return (await runMigrationCommand(ready, retry)).code;
}

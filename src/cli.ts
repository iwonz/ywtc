#!/usr/bin/env node
import {cliHelp, parseCliArguments} from './cli-arguments.js';
import {readWorkspaceConfig, validateProfileSecrets} from './config.js';
import {resolveDestinationLocator, resolveSourceLocator} from './locators.js';
import {redact} from './logger.js';
import {loadHashtagPolicy} from './hashtag-policy.js';
import {loadMentionPolicy} from './mention-policy.js';
import {readyMigrationCommand, runMigrationCommand} from './migration-command.js';
import {runUpdate} from './updater.js';
import {packageVersion} from './version.js';
import {
  initializeWorkspace,
  resolveInitWorkspace,
  resolveWorkspace,
  workspaceIsInitialized,
} from './workspace.js';

const color = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code: number, value: string) => color ? `\u001b[${code}m${value}\u001b[0m` : value;

function heading(label: string): void {
  console.log(`\n${paint(36, '◆')} ${paint(1, label)}`);
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
  if (command.command === 'ui') {
    const {launchUi} = await import(new URL('./ui-launcher.js', import.meta.url).href);
    return launchUi(command);
  }
  if (command.command === 'migrations') {
    const {runMigrationsCommand} = await import('./jobs/command.js');
    return runMigrationsCommand(command);
  }
  if (command.command === 'init') {
    if (command.interactive) {
      const [{assertInteractiveTerminal, runInteractiveInit}, {ClackPrompter}] = await Promise.all([
        import('./interactive-init.js'),
        import('./wizard-prompts.js'),
      ]);
      assertInteractiveTerminal(process.stdin.isTTY, process.stdout.isTTY);
      const result = await runInteractiveInit({
        ...(command.workdir ? {workdir: command.workdir} : {}),
        prompter: new ClackPrompter(),
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
      loadMentionPolicy(config);
      loadHashtagPolicy(config);
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
    const result = await runCapabilityDoctor(config, source, destination, command.scope, command.sourceStatus, command.comments);
    console.log(`  Source    ${paint(32, `${result.source.product}${result.source.version ? ` ${result.source.version}` : ''}`)} · ${result.source.title}`);
    console.log(`  Dest      ${paint(32, `${result.destination.product}${result.destination.version ? ` ${result.destination.version}` : ''}`)}`);
    console.log(`  Scope     ${result.pages} pages · ${result.links} links · status ${result.sourceStatus}`);
    console.log(`  ${result.sourceKind === 'space' ? 'Space   ' : 'Tree    '}  ${result.returnedDescendants} ${result.sourceKind === 'space' ? 'pages' : 'descendants'} returned · ${result.selectedDescendants} selected · ${result.excludedPages} excluded · depth ${result.maximumDepth}`);
    console.log(`  Comments  ${result.comments.enabled ? `${result.comments.entries} entries · ${result.comments.threads} threads · destination write ${result.comments.destinationWrite}` : 'disabled'}`);
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
  if (command.command === 'retry') {
    const {runRetryCommand} = await import('./retry-command.js');
    return runRetryCommand(command);
  }
  if(command.command==='sync'){
    const {runSyncCommand}=await import('./sync-command.js');
    return runSyncCommand(command);
  }
  if (command.command === 'mentions-export' || command.command === 'hashtags-export') {
    const {runMentionExportCommand} = await import('./mention-command.js');
    return runMentionExportCommand(command);
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
        const issues = `${report.errors} errors · ${report.warnings} warnings · ${report.degradations} degradations · ${report.adaptations ?? 0} adaptations`;
        console.log(`  ${report.runId}  ${report.finishedAt ?? report.startedAt}  ${report.status}`);
        if (report.retry) console.log(`    retry ${report.retry.attempt} · root ${report.retry.rootRunId} · parent ${report.retry.parentRunId}`);
        console.log(`    ${report.direction} · ${report.scope} · source status ${report.sourceStatus} · ${report.selectedDescendants}/${report.returnedDescendants} ${report.sourceKind === 'space' ? 'space pages' : 'descendants'} selected · ${report.excludedPages} excluded · depth ${report.maximumDepth}`);
        console.log(`    source ${report.pages} pages · ${report.hierarchyGaps} hierarchy gaps · ${report.hierarchyRepairs} repaired · ${report.inventoryComplete ? 'inventory complete' : 'inventory incomplete'}`);
        if (report.inventoryReusedPages || report.inventoryRecoveryAttempts || report.inventoryRemainingFailures) {
          console.log(`    inventory ${report.inventoryReusedPages} reused · ${report.inventoryFreshPages} fresh · ${report.inventoryRecoveryAttempts} recovery attempts${report.inventoryRemainingFailures ? ` · ${report.inventoryRemainingFailures} remaining failures` : ''}`);
        }
        console.log(`    pages ${report.complete} complete · ${report.partial} partial · ${report.failed} failed · ${report.blocked} blocked · ${report.conflicts} conflicts · ${report.notStartedPages} not started`);
        console.log(`    files ${report.resourcesComplete}/${report.resources} complete · ${report.resourcesPartial} partial · ${report.resourcesFailed} failed · ${report.resourcesBlocked} blocked · ${report.resourcesNotStarted} not started${report.resourcesPlanned ? ` · ${report.resourcesPlanned} planned` : ''} · ${issues}`);
        console.log(`    causes ${report.rootErrors} root errors · ${report.dependentPages} dependent pages · ${report.dependentFiles} dependent files · ${report.dependentComments} dependent comment archives`);
        console.log(`    comments ${report.comments} entries · ${report.commentThreads} threads · ${report.commentAttachments} files · ${Object.entries(report.commentStatuses).map(([status, count]) => `${count} ${status}`).join(' · ')}`);
        if ((report.mentionOutcomes.total ?? 0) > 0) {
          const locations = [[report.pageMentions, 'page'], [report.commentMentions, 'comment']]
            .filter(([count]) => Number(count) > 0).map(([count, label]) => `${count} ${label}`).join(' · ');
          const outcomes = Object.entries(report.mentionOutcomes).filter(([status, count]) => status !== 'total' && count > 0).map(([status, count]) => `${count} ${status}`).join(' · ');
          console.log(`    mentions ${report.mentionMode ?? 'off'} · ${report.mentionOutcomes.total} total / ${report.mentionIdentities} identities${locations ? ` · ${locations}` : ''}${outcomes ? ` · ${outcomes}` : ''}`);
        }
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
  if (command.interactive) {
    const [{assertInteractiveTerminal}, {runInteractiveMigration}, {ClackPrompter}] = await Promise.all([
      import('./interactive-init.js'),
      import('./interactive-migrate.js'),
      import('./wizard-prompts.js'),
    ]);
    assertInteractiveTerminal(process.stdin.isTTY, process.stdout.isTTY, 'migrate');
    const result = await runInteractiveMigration({command, prompter: new ClackPrompter()});
    return result.code;
  }
  return (await runMigrationCommand(readyMigrationCommand(command))).code;
}

main().then((code) => { process.exitCode = code; }).catch((error) => {
  console.error(`ERROR ${redact(error, [])}`);
  process.exitCode = 2;
});

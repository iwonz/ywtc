#!/usr/bin/env node
import {createConfluenceClient} from './clients/confluence-factory.js';
import {YandexWikiClient} from './clients/yandex-wiki.js';
import {CLI_HELP, COMMAND_HELP, parseCliArguments} from './cli-arguments.js';
import {readWorkspaceConfig, secretValues} from './config.js';
import {runCapabilityDoctor} from './doctor.js';
import {parseWikiSource} from './input.js';
import {createLogger, redact} from './logger.js';
import {Migrator} from './migrator.js';
import {TerminalMigrationProgress} from './progress.js';
import {runUpdate} from './updater.js';
import {packageVersion} from './version.js';
import {
  initializeWorkspace,
  resolveWorkspace,
  resolveWorkspacePath,
  validateWorkspaceMarker,
} from './workspace.js';

const color = process.stdout.isTTY && !process.env.NO_COLOR;
const cyan = (value: string) => color ? `\u001b[36m${value}\u001b[0m` : value;
const green = (value: string) => color ? `\u001b[32m${value}\u001b[0m` : value;
const yellow = (value: string) => color ? `\u001b[33m${value}\u001b[0m` : value;
const dim = (value: string) => color ? `\u001b[2m${value}\u001b[0m` : value;

function heading(label: string): void {
  console.log(`\n${cyan('◆')} ${cyan(label)}`);
}

async function migrate(command: Extract<ReturnType<typeof parseCliArguments>, {command: 'migrate'}>): Promise<number> {
  const workspace = await resolveWorkspace(command.workdir ? {explicit: command.workdir} : {});
  const initialized = await initializeWorkspace(workspace);
  await validateWorkspaceMarker(workspace);
  heading('ywtc migration');
  console.log(`  Workdir  ${workspace.root} ${dim(`(${workspace.source})`)}`);
  if (initialized.created.length > 0) console.log(`  Created  ${initialized.created.join(', ')}`);

  const config = readWorkspaceConfig(workspace.envFile);
  const secrets = secretValues(config);
  const logger = createLogger(secrets);
  const concurrency = command.concurrency ?? config.concurrency;
  const sourceSlug = parseWikiSource(command.source, config.yandex.webUrl);
  const progress = new TerminalMigrationProgress();
  const stateFilename = command.stateFilename
    ? resolveWorkspacePath(workspace, command.stateFilename)
    : undefined;
  progress.start({
    source: command.source,
    target: command.target,
    dryRun: command.dryRun,
    singlePage: command.singlePage,
    fresh: command.fresh,
    stateFilename: stateFilename ?? `automatic · ${workspace.statesDirectory}`,
    orchestrationConcurrency: concurrency,
    networkLimits: config.networkLimits,
  });
  const yandex = new YandexWikiClient(config.yandex, config.timeoutMs, config.networkLimits.yandex);
  const confluence = createConfluenceClient(config);
  const migrator = new Migrator({yandex, confluence, config, logger, progress, secrets});
  try {
    const result = await migrator.run({
      sourceSlug,
      target: command.target,
      dryRun: command.dryRun,
      singlePage: command.singlePage,
      fresh: command.fresh,
      concurrency,
      runtimeDirectory: workspace.statesDirectory,
      ...(stateFilename ? {stateFilename} : {}),
    });
    return result.hasErrors ? 1 : 0;
  } catch (error) {
    progress.fail(redact(error, secrets));
    throw error;
  }
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const command = parseCliArguments(argv);
  if (command.command === 'help') {
    console.log(command.topic ? COMMAND_HELP[command.topic] : CLI_HELP);
    return 0;
  }
  if (command.command === 'version') {
    console.log(packageVersion());
    return 0;
  }
  if (command.command === 'init') {
    const workspace = await resolveWorkspace(command.workdir ? {explicit: command.workdir} : {});
    const result = await initializeWorkspace(workspace);
    heading('Workspace ready');
    console.log(`  Path     ${workspace.root}`);
    console.log(`  Config   ${workspace.envFile}`);
    console.log(`  State    ${workspace.statesDirectory}`);
    console.log(`  Created  ${result.created.length ? result.created.join(', ') : 'nothing'}`);
    console.log(`  Reused   ${result.existing.length ? result.existing.join(', ') : 'nothing'}`);
    return 0;
  }
  if (command.command === 'doctor') {
    const workspace = await resolveWorkspace(command.workdir ? {explicit: command.workdir} : {});
    await validateWorkspaceMarker(workspace);
    const config = readWorkspaceConfig(workspace.envFile);
    heading('Workspace diagnosis');
    console.log(`  Workdir     ${green(workspace.root)}`);
    console.log(`  Config      ${green('valid')} · ${workspace.envFile}`);
    console.log(`  Confluence  ${config.confluence.deployment} / ${config.confluence.authType}`);
    if (!command.source || !command.target) {
      console.log(`  API checks  ${dim('not requested; pass both --source and --target')}`);
      return 0;
    }
    const result = await runCapabilityDoctor(config, command.source, command.target);
    console.log(`  Platform    ${green(result.platform ?? result.deployment)}${result.version ? ` ${result.version}` : ''}`);
    console.log(`  Source      ${green(`${result.source?.title} · ${result.source?.id}`)}`);
    console.log(`  Target      ${green(`${result.target?.title} · ${result.target?.id} · ${result.target?.spaceKey}`)}`);
    for (const warning of result.warnings) console.log(`  ${yellow('Warning')}     ${warning}`);
    return 0;
  }
  if (command.command === 'update') {
    const result = await runUpdate({
      currentVersion: packageVersion(), install: command.install, ...(command.via ? {via: command.via} : {}),
    });
    heading('Update status');
    console.log(`  Current  ${result.current}`);
    console.log(`  Latest   ${result.latest}`);
    console.log(`  Channel  ${result.channel}`);
    console.log(`  Status   ${result.installed ? green('updated') : result.updateAvailable ? yellow('update available') : green('up to date')}`);
    if (!result.installed && result.updateAvailable) {
      console.log(`  Command  ${result.command}`);
      if (command.install && ['source', 'npx', 'local', 'unknown'].includes(result.channel)) {
        console.log(`  Note     ${yellow('This installation is not safe to self-modify; run the command explicitly.')}`);
      }
    }
    return 0;
  }
  return migrate(command);
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(`ERROR ${redact(error, [])}`);
    process.exitCode = 1;
  });

import {Command, Option} from '@commander-js/extra-typings';
import type {ExportFormat, SourceStatus, TransferScope} from './domain.js';
import {packageVersion} from './version.js';

export type CliHelpTopic = 'init' | 'doctor' | 'migrate' | 'reports' | 'update';

export type CliCommand =
  | {command: 'help'; topic?: CliHelpTopic}
  | {command: 'version'}
  | {command: 'init'; workdir?: string; interactive: boolean}
  | {
    command: 'doctor';
    workdir?: string;
    source?: string;
    destination?: string;
    sourceProfile?: string;
    destinationProfile?: string;
    scope: TransferScope;
    sourceStatus: SourceStatus;
    comments: boolean;
    format?: ExportFormat;
  }
  | {
    command: 'migrate';
    source?: string;
    destination?: string;
    sourceProfile?: string;
    destinationProfile?: string;
    scope: TransferScope;
    sourceStatus: SourceStatus;
    comments: boolean;
    format?: ExportFormat;
    archive: boolean;
    workdir?: string;
    dryRun: boolean;
    fresh: boolean;
    concurrency?: number;
    stateFilename?: string;
    openReport: boolean;
    interactive: boolean;
  }
  | {command: 'reports-list'; workdir?: string}
  | {command: 'reports-open'; runId?: string; workdir?: string}
  | {command: 'update'; install: boolean; via?: 'npm' | 'brew'};

function nonEmpty(value: string | undefined, option: string): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${option} must be non-empty.`);
  return trimmed;
}

function concurrency(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 64) throw new Error('--concurrency must be an integer between 1 and 64.');
  return parsed;
}

export function createCliProgram(onCommand: (command: CliCommand) => void = () => undefined): Command {
  const program = new Command()
    .name('ywtc')
    .description('Loss-aware Yandex Wiki and Confluence transfer CLI')
    .version(packageVersion(), '-v, --version')
    .showHelpAfterError('(run ywtc --help for usage)')
    .showSuggestionAfterError(true);

  program.command('init')
    .description('Create a workspace or configure it with a guided terminal wizard')
    .option('-w, --workdir <path>', 'workspace to initialize')
    .option('-i, --interactive', 'configure Yandex Wiki and Confluence in a TTY wizard', false)
    .action((options) => {
      const workdir = nonEmpty(options.workdir, '--workdir');
      onCommand({command: 'init', interactive: options.interactive, ...(workdir ? {workdir} : {})});
    });

  program.command('doctor')
    .description('Validate profiles and optionally perform read-only endpoint preflight')
    .option('-w, --workdir <path>', 'workspace to inspect')
    .option('-s, --source <locator>', 'source page URL, ID, or slug')
    .option('-d, --destination <locator>', 'destination page URL, ID, slug, or directory')
    .option('-S, --source-profile <name>', 'named source connection')
    .option('-D, --destination-profile <name>', 'named destination connection')
    .addOption(new Option('-m, --scope <scope>', 'selection scope').choices(['page', 'subtree', 'linked']).default('subtree'))
    .addOption(new Option('-t, --source-status <status>', 'automatically discovered page status').choices(['all', 'current']).default('all'))
    .option('-C, --comments', 'read and archive page comments (default)', true)
    .option('-N, --no-comments', 'skip all comment API calls and archive work')
    .addOption(new Option('-f, --format <format>', 'filesystem format').choices(['markdown', 'html']))
    .action((options) => {
      const source = nonEmpty(options.source, '--source');
      const destination = nonEmpty(options.destination, '--destination');
      const workdir = nonEmpty(options.workdir, '--workdir');
      const sourceProfile = nonEmpty(options.sourceProfile, '--source-profile');
      const destinationProfile = nonEmpty(options.destinationProfile, '--destination-profile');
      if (Boolean(source) !== Boolean(destination)) throw new Error('doctor requires both --source and --destination for API preflight, or neither for local checks.');
      onCommand({
        command: 'doctor',
        scope: options.scope as TransferScope,
        sourceStatus: options.sourceStatus as SourceStatus,
        comments: options.comments,
        ...(workdir ? {workdir} : {}),
        ...(source && destination ? {source, destination} : {}),
        ...(sourceProfile ? {sourceProfile} : {}),
        ...(destinationProfile ? {destinationProfile} : {}),
        ...(options.format ? {format: options.format as ExportFormat} : {}),
      });
    });

  program.command('migrate')
    .description('Transfer or export a page graph, optionally through a TTY wizard')
    .option('-i, --interactive', 'choose migration parameters and dry-run/live actions in a TTY wizard', false)
    .option('-s, --source <locator>', 'source page URL, ID, or slug (required without --interactive)')
    .option('-d, --destination <locator>', 'destination page URL, ID, slug, or directory (required without --interactive)')
    .option('-S, --source-profile <name>', 'named source connection')
    .option('-D, --destination-profile <name>', 'named destination connection')
    .addOption(new Option('-m, --scope <scope>', 'selection scope').choices(['page', 'subtree', 'linked']).default('subtree'))
    .addOption(new Option('-t, --source-status <status>', 'automatically discovered page status').choices(['all', 'current']).default('all'))
    .option('-C, --comments', 'read and archive page comments (default)', true)
    .option('-N, --no-comments', 'skip all comment API calls and archive work')
    .addOption(new Option('-f, --format <format>', 'filesystem format').choices(['markdown', 'html']))
    .option('-a, --archive', 'also create a ZIP for filesystem output', false)
    .option('-w, --workdir <path>', 'workspace (configured CWD, then ~/.ywtc)')
    .option('-n, --dry-run', 'discover and render without destination writes', false)
    .option('-F, --fresh', 'ignore mappings and preserve existing live state as a backup', false)
    .option('-o, --open-report', 'open the generated HTML report in the system browser', false)
    .option('-j, --concurrency <n>', 'orchestration concurrency from 1 to 64', concurrency)
    .option('-r, --state <path>', 'state path inside workdir')
    .action((options) => {
      const source = nonEmpty(options.source, '--source');
      const destination = nonEmpty(options.destination, '--destination');
      const sourceProfile = nonEmpty(options.sourceProfile, '--source-profile');
      const destinationProfile = nonEmpty(options.destinationProfile, '--destination-profile');
      const workdir = nonEmpty(options.workdir, '--workdir');
      const stateFilename = nonEmpty(options.state, '--state');
      if (!options.interactive && (!source || !destination)) {
        throw new Error('migrate requires both --source and --destination unless --interactive is used.');
      }
      if (!options.interactive && options.archive && !options.format) throw new Error('--archive requires --format markdown|html and a directory destination.');
      if (!options.interactive && options.format && destination && /^https?:\/\//i.test(destination)) throw new Error('--format cannot be used with a remote HTTP(S) destination.');
      onCommand({
        command: 'migrate',
        scope: options.scope as TransferScope,
        sourceStatus: options.sourceStatus as SourceStatus,
        comments: options.comments,
        archive: options.archive,
        dryRun: options.dryRun,
        fresh: options.fresh,
        openReport: options.openReport,
        interactive: options.interactive,
        ...(source ? {source} : {}),
        ...(destination ? {destination} : {}),
        ...(sourceProfile ? {sourceProfile} : {}),
        ...(destinationProfile ? {destinationProfile} : {}),
        ...(options.format ? {format: options.format as ExportFormat} : {}),
        ...(workdir ? {workdir} : {}),
        ...(options.concurrency !== undefined ? {concurrency: options.concurrency} : {}),
        ...(stateFilename ? {stateFilename} : {}),
      });
    });

  const reports = program.command('reports').description('List and open local migration reports');
  reports.command('list')
    .description('List valid reports from newest to oldest')
    .option('-w, --workdir <path>', 'workspace containing reports')
    .action((options) => {
      const workdir = nonEmpty(options.workdir, '--workdir');
      onCommand({command: 'reports-list', ...(workdir ? {workdir} : {})});
    });
  reports.command('open')
    .description('Open a report by run ID, or the latest report with "last" or no selector')
    .argument('[run-id|last]', 'report run ID from "ywtc reports list", or "last"')
    .option('-w, --workdir <path>', 'workspace containing reports')
    .action((runIdValue: string | undefined, options) => {
      const runId = nonEmpty(runIdValue, 'run-id');
      const workdir = nonEmpty(options.workdir, '--workdir');
      onCommand({command: 'reports-open', ...(runId ? {runId} : {}), ...(workdir ? {workdir} : {})});
    });

  program.command('update')
    .description('Check for a newer release and optionally update a safe installation')
    .option('-i, --install', 'install after checking', false)
    .addOption(new Option('-c, --via <channel>', 'force a compatible installation channel').choices(['npm', 'brew']))
    .action((options) => onCommand({
      command: 'update',
      install: options.install,
      ...(options.via ? {via: options.via as 'npm' | 'brew'} : {}),
    }));
  return program;
}

export function parseCliArguments(argv: string[]): CliCommand {
  if (argv.length === 0 || (argv.length === 1 && ['--help', '-h'].includes(argv[0]!))) return {command: 'help'};
  if (argv.length === 1 && ['--version', '-v'].includes(argv[0]!)) return {command: 'version'};
  const helpIndex = argv.findIndex((value) => ['--help', '-h'].includes(value));
  if (helpIndex >= 0) {
    const topic = argv[0];
    return ['init', 'doctor', 'migrate', 'reports', 'update'].includes(topic ?? '')
      ? {command: 'help', topic: topic as CliHelpTopic}
      : {command: 'help'};
  }
  let parsed: CliCommand | undefined;
  const output: string[] = [];
  const program = createCliProgram((command) => { parsed = command; });
  program.exitOverride();
  for (const command of program.commands) command.exitOverride();
  const writers = {writeOut: (value: string) => output.push(value), writeErr: (value: string) => output.push(value)};
  program.configureOutput(writers);
  for (const command of program.commands) command.configureOutput(writers);
  try {
    program.parse(['node', 'ywtc', ...argv], {from: 'node'});
  } catch (error) {
    const message = output.join('').trim();
    throw new Error(message || (error instanceof Error ? error.message : String(error)));
  }
  if (!parsed) throw new Error('No command was selected. Run "ywtc --help".');
  return parsed;
}

export function cliHelp(topic?: CliHelpTopic): string {
  const program = createCliProgram();
  if (!topic) return program.helpInformation();
  const command = program.commands.find((candidate) => candidate.name() === topic);
  return command?.helpInformation() ?? program.helpInformation();
}

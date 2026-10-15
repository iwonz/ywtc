import {Command, Option} from '@commander-js/extra-typings';
import type {ExportFormat, TransferScope} from './domain.js';
import {packageVersion} from './version.js';

export type CliCommand =
  | {command: 'help'; topic?: 'init' | 'doctor' | 'migrate' | 'update'}
  | {command: 'version'}
  | {command: 'init'; workdir?: string}
  | {
    command: 'doctor';
    workdir?: string;
    source?: string;
    destination?: string;
    sourceProfile?: string;
    destinationProfile?: string;
    scope: TransferScope;
    format?: ExportFormat;
  }
  | {
    command: 'migrate';
    source: string;
    destination: string;
    sourceProfile?: string;
    destinationProfile?: string;
    scope: TransferScope;
    format?: ExportFormat;
    archive: boolean;
    workdir?: string;
    dryRun: boolean;
    fresh: boolean;
    concurrency?: number;
    stateFilename?: string;
  }
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
    .description('Create or repair a workspace without overwriting data')
    .option('--workdir <path>', 'workspace to initialize')
    .action((options) => {
      const workdir = nonEmpty(options.workdir, '--workdir');
      onCommand({command: 'init', ...(workdir ? {workdir} : {})});
    });

  program.command('doctor')
    .description('Validate profiles and optionally perform read-only endpoint preflight')
    .option('--workdir <path>', 'workspace to inspect')
    .option('--source <locator>', 'source page URL, ID, or slug')
    .option('--destination <locator>', 'destination page URL, ID, slug, or directory')
    .option('--source-profile <name>', 'named source connection')
    .option('--destination-profile <name>', 'named destination connection')
    .addOption(new Option('--scope <scope>', 'selection scope').choices(['page', 'subtree', 'linked']).default('subtree'))
    .addOption(new Option('--format <format>', 'filesystem format').choices(['markdown', 'html']))
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
        ...(workdir ? {workdir} : {}),
        ...(source && destination ? {source, destination} : {}),
        ...(sourceProfile ? {sourceProfile} : {}),
        ...(destinationProfile ? {destinationProfile} : {}),
        ...(options.format ? {format: options.format as ExportFormat} : {}),
      });
    });

  program.command('migrate')
    .description('Transfer or export a page graph')
    .requiredOption('--source <locator>', 'source page URL, ID, or slug')
    .requiredOption('--destination <locator>', 'destination page URL, ID, slug, or directory')
    .option('--source-profile <name>', 'named source connection')
    .option('--destination-profile <name>', 'named destination connection')
    .addOption(new Option('--scope <scope>', 'selection scope').choices(['page', 'subtree', 'linked']).default('subtree'))
    .addOption(new Option('--format <format>', 'filesystem format').choices(['markdown', 'html']))
    .option('--archive', 'also create a ZIP for filesystem output', false)
    .option('--workdir <path>', 'workspace (marked CWD, then ~/.ywtc)')
    .option('--dry-run', 'discover and render without destination writes', false)
    .option('--fresh', 'ignore mappings and preserve existing live state as a backup', false)
    .option('--concurrency <n>', 'orchestration concurrency from 1 to 64', concurrency)
    .option('--state <path>', 'state path inside workdir')
    .action((options) => {
      const source = nonEmpty(options.source, '--source')!;
      const destination = nonEmpty(options.destination, '--destination')!;
      const sourceProfile = nonEmpty(options.sourceProfile, '--source-profile');
      const destinationProfile = nonEmpty(options.destinationProfile, '--destination-profile');
      const workdir = nonEmpty(options.workdir, '--workdir');
      const stateFilename = nonEmpty(options.state, '--state');
      if (options.archive && !options.format) throw new Error('--archive requires --format markdown|html and a directory destination.');
      if (options.format && /^https?:\/\//i.test(destination)) throw new Error('--format cannot be used with a remote HTTP(S) destination.');
      onCommand({
        command: 'migrate',
        source,
        destination,
        scope: options.scope as TransferScope,
        archive: options.archive,
        dryRun: options.dryRun,
        fresh: options.fresh,
        ...(sourceProfile ? {sourceProfile} : {}),
        ...(destinationProfile ? {destinationProfile} : {}),
        ...(options.format ? {format: options.format as ExportFormat} : {}),
        ...(workdir ? {workdir} : {}),
        ...(options.concurrency !== undefined ? {concurrency: options.concurrency} : {}),
        ...(stateFilename ? {stateFilename} : {}),
      });
    });

  program.command('update')
    .description('Check for a newer release and optionally update a safe installation')
    .option('--install', 'install after checking', false)
    .addOption(new Option('--via <channel>', 'force a compatible installation channel').choices(['npm', 'brew']))
    .action((options) => onCommand({
      command: 'update',
      install: options.install,
      ...(options.via ? {via: options.via as 'npm' | 'brew'} : {}),
    }));
  return program;
}

export function parseCliArguments(argv: string[]): CliCommand {
  if (argv.includes('--target')) throw new Error('--target was removed in ywtc 2.0. Use --destination.');
  if (argv.includes('--single-page')) throw new Error('--single-page was removed in ywtc 2.0. Use --scope page.');
  if (argv.length === 0 || (argv.length === 1 && ['--help', '-h'].includes(argv[0]!))) return {command: 'help'};
  if (argv.length === 1 && ['--version', '-v'].includes(argv[0]!)) return {command: 'version'};
  const helpIndex = argv.findIndex((value) => ['--help', '-h'].includes(value));
  if (helpIndex >= 0) {
    const topic = argv[0];
    return ['init', 'doctor', 'migrate', 'update'].includes(topic ?? '')
      ? {command: 'help', topic: topic as 'init' | 'doctor' | 'migrate' | 'update'}
      : {command: 'help'};
  }
  let parsed: CliCommand | undefined;
  const output: string[] = [];
  const program = createCliProgram((command) => { parsed = command; });
  program.exitOverride();
  program.configureOutput({writeOut: (value) => output.push(value), writeErr: (value) => output.push(value)});
  try {
    program.parse(['node', 'ywtc', ...argv], {from: 'node'});
  } catch (error) {
    const message = output.join('').trim();
    throw new Error(message || (error instanceof Error ? error.message : String(error)));
  }
  if (!parsed) throw new Error('No command was selected. Run "ywtc --help".');
  return parsed;
}

export function cliHelp(topic?: 'init' | 'doctor' | 'migrate' | 'update'): string {
  const program = createCliProgram();
  if (!topic) return program.helpInformation();
  const command = program.commands.find((candidate) => candidate.name() === topic);
  return command?.helpInformation() ?? program.helpInformation();
}

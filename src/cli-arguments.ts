import {parseArgs} from 'node:util';

export const CLI_HELP = `ywtc — Yandex Wiki to Confluence migration CLI

Usage:
  ywtc init [--workdir <path>]
  ywtc doctor [--workdir <path>] [--source <value> --target <value>]
  ywtc migrate --source <value> --target <value> [options]
  ywtc update [--install] [--via npm|brew]
  ywtc --version

Commands:
  init      Create or repair a workspace without overwriting existing data
  doctor    Validate configuration and optionally run read-only API preflight
  migrate   Plan or migrate a Wiki page or subtree
  update    Check for a newer release and optionally update a safe installation

Run "ywtc <command> --help" for command-specific options.
`;

export const COMMAND_HELP = {
  init: `Usage: ywtc init [--workdir <path>]\n\nOptions:\n  --workdir <path>  Workspace to initialize\n  --help, -h        Show this help\n`,
  doctor: `Usage: ywtc doctor [--workdir <path>] [--source <value> --target <value>]\n\nOptions:\n  --workdir <path>  Workspace to inspect\n  --source <value>  Yandex Wiki slug or URL (requires --target)\n  --target <value>  Confluence page ID or URL (requires --source)\n  --help, -h        Show this help\n`,
  migrate: `Usage: ywtc migrate --source <value> --target <value> [options]\n\nOptions:\n  --source <value>       Yandex Wiki section slug or absolute URL\n  --target <value>       Confluence parent page ID or supported absolute URL\n  --workdir <path>       Workspace (default: marked CWD, then ~/.ywtc)\n  --dry-run              Discover, validate, and convert without Confluence writes\n  --single-page          Migrate only the source page, without descendants\n  --concurrency <n>      Override page preparation concurrency (1..32)\n  --state <path>         State file relative to workdir, or an absolute path inside it\n  --fresh                Ignore mappings; preserve existing live state as a backup\n  --help, -h             Show this help\n`,
  update: `Usage: ywtc update [--install] [--via npm|brew]\n\nOptions:\n  --install         Install after checking; omitted means read-only check\n  --via <channel>   Force npm or brew when compatible with the installation\n  --help, -h        Show this help\n`,
} as const;

export type CliCommand =
  | {command: 'help'; topic?: keyof typeof COMMAND_HELP}
  | {command: 'version'}
  | {command: 'init'; workdir?: string}
  | {command: 'doctor'; workdir?: string; source?: string; target?: string}
  | {
    command: 'migrate';
    source: string;
    target: string;
    workdir?: string;
    dryRun: boolean;
    singlePage: boolean;
    fresh: boolean;
    concurrency?: number;
    stateFilename?: string;
  }
  | {command: 'update'; install: boolean; via?: 'npm' | 'brew'};

function positiveInteger(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 32) {
    throw new Error(`${name} must be an integer between 1 and 32.`);
  }
  return parsed;
}

function nonEmpty(value: string | undefined, option: string): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${option} must be non-empty.`);
  return trimmed;
}

function parseCommandOptions(command: keyof typeof COMMAND_HELP, argv: string[]): Record<string, unknown> {
  const common = {help: {type: 'boolean' as const, short: 'h', default: false}};
  if (command === 'init') {
    return parseArgs({args: argv, strict: true, allowPositionals: false, options: {
      ...common, workdir: {type: 'string'},
    }}).values;
  }
  if (command === 'doctor') {
    return parseArgs({args: argv, strict: true, allowPositionals: false, options: {
      ...common, workdir: {type: 'string'}, source: {type: 'string'}, target: {type: 'string'},
    }}).values;
  }
  if (command === 'migrate') {
    return parseArgs({args: argv, strict: true, allowPositionals: false, options: {
      ...common,
      source: {type: 'string'}, target: {type: 'string'}, workdir: {type: 'string'},
      'dry-run': {type: 'boolean', default: false},
      'single-page': {type: 'boolean', default: false}, fresh: {type: 'boolean', default: false},
      concurrency: {type: 'string'}, state: {type: 'string'},
    }}).values;
  }
  return parseArgs({args: argv, strict: true, allowPositionals: false, options: {
    ...common, install: {type: 'boolean', default: false}, via: {type: 'string'},
  }}).values;
}

export function parseCliArguments(argv: string[]): CliCommand {
  const first = argv[0];
  if (first === '--version' || first === '-v') {
    if (argv.length > 1) throw new Error('--version does not accept additional arguments.');
    return {command: 'version'};
  }
  if (first === '--help' || first === '-h' || first === undefined) return {command: 'help'};
  if (!['init', 'doctor', 'migrate', 'update'].includes(first)) {
    if (first.startsWith('-')) {
      throw new Error(`The v2 CLI requires a command. Use "ywtc migrate ${argv.join(' ')}" or run "ywtc --help".`);
    }
    throw new Error(`Unknown command "${first}". Run "ywtc --help" for usage.`);
  }

  const command = first as keyof typeof COMMAND_HELP;
  const values = parseCommandOptions(command, argv.slice(1));
  if (values.help) return {command: 'help', topic: command};

  if (command === 'init') {
    const workdir = nonEmpty(values.workdir as string | undefined, '--workdir');
    return {command, ...(workdir ? {workdir} : {})};
  }
  if (command === 'doctor') {
    const workdir = nonEmpty(values.workdir as string | undefined, '--workdir');
    const source = nonEmpty(values.source as string | undefined, '--source');
    const target = nonEmpty(values.target as string | undefined, '--target');
    if ((source && !target) || (!source && target)) {
      throw new Error('doctor requires both --source and --target for API preflight, or neither for local checks.');
    }
    return {command, ...(workdir ? {workdir} : {}), ...(source ? {source, target: target as string} : {})};
  }
  if (command === 'update') {
    const via = nonEmpty(values.via as string | undefined, '--via');
    if (via && via !== 'npm' && via !== 'brew') throw new Error('--via must be either npm or brew.');
    return {command, install: (values.install as boolean | undefined) ?? false, ...(via ? {via: via as 'npm' | 'brew'} : {})};
  }

  const source = nonEmpty(values.source as string | undefined, '--source');
  const target = nonEmpty(values.target as string | undefined, '--target');
  if (!source || !target) throw new Error('migrate requires non-empty --source and --target. Run "ywtc migrate --help".');
  const workdir = nonEmpty(values.workdir as string | undefined, '--workdir');
  const stateFilename = nonEmpty(values.state as string | undefined, '--state');
  const concurrency = values.concurrency as string | undefined;
  return {
    command,
    source,
    target,
    dryRun: (values['dry-run'] as boolean | undefined) ?? false,
    singlePage: (values['single-page'] as boolean | undefined) ?? false,
    fresh: (values.fresh as boolean | undefined) ?? false,
    ...(workdir ? {workdir} : {}),
    ...(stateFilename ? {stateFilename} : {}),
    ...(concurrency ? {concurrency: positiveInteger(concurrency, '--concurrency')} : {}),
  };
}

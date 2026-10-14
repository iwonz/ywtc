import {parseArgs} from 'node:util';

export const CLI_HELP = `ywtc — Yandex Wiki to Confluence Data Center migrator

Usage:
  npm run migrate -- --source <wiki-slug-or-url> --target <page-id-or-url> [options]

Options:
  --source <value>       Yandex Wiki section slug or absolute URL
  --target <value>       Confluence parent page ID or absolute URL
  --dry-run              Discover, validate, and convert without Confluence writes
  --single-page          Migrate only the source page, without descendants
  --concurrency <number> Override the page preparation work queue (API limits still apply)
  --state <path>         Exact state file override (default: automatic per source/target)
  --fresh                Ignore prior mappings; preserve existing live state as a backup
  --help                 Show this help
`;

export type CliArguments = {
  help: true;
} | {
  help: false;
  source: string;
  target: string;
  dryRun: boolean;
  singlePage: boolean;
  fresh: boolean;
  concurrency?: number;
  stateFilename?: string;
};

function positiveInteger(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 32) {
    throw new Error(`${name} must be an integer between 1 and 32.`);
  }
  return parsed;
}

export function parseCliArguments(argv: string[]): CliArguments {
  const {values} = parseArgs({
    args: argv,
    strict: true,
    allowPositionals: false,
    options: {
      source: {type: 'string'},
      target: {type: 'string'},
      'dry-run': {type: 'boolean', default: false},
      'single-page': {type: 'boolean', default: false},
      fresh: {type: 'boolean', default: false},
      concurrency: {type: 'string'},
      state: {type: 'string'},
      help: {type: 'boolean', short: 'h', default: false},
    },
  });

  if (values.help) return {help: true};
  const source = values.source?.trim();
  const target = values.target?.trim();
  if (!source || !target) {
    throw new Error('Both --source and --target are required and must be non-empty. Use --help for usage.');
  }
  const stateFilename = values.state?.trim();
  if (values.state !== undefined && !stateFilename) {
    throw new Error('--state must be a non-empty file path. Omit --state to use automatic state selection.');
  }

  return {
    help: false,
    source,
    target,
    dryRun: values['dry-run'] ?? false,
    singlePage: values['single-page'] ?? false,
    fresh: values.fresh ?? false,
    ...(values.concurrency ? {concurrency: positiveInteger(values.concurrency, '--concurrency')} : {}),
    ...(stateFilename ? {stateFilename} : {}),
  };
}

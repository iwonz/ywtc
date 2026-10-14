import type {NetworkLimits} from './config.js';
import type {MigrationReportPaths} from './report.js';
import type {StateLoadSource} from './state.js';
import type {MigrationPlanSummary} from './types.js';

export interface ProgressStart {
  source: string;
  target: string;
  dryRun: boolean;
  singlePage: boolean;
  fresh: boolean;
  stateFilename: string;
  orchestrationConcurrency: number;
  networkLimits: NetworkLimits;
}

export interface ProgressState {
  id: string;
  mode: 'automatic' | 'explicit';
  filename: string;
  source: StateLoadSource;
  backupFilename?: string;
  dryRun: boolean;
}

export interface ProgressItem {
  kind: 'page skeleton' | 'page content' | 'attachment' | 'dry-run';
  status: 'created' | 'updated' | 'uploaded' | 'reused' | 'planned' | 'skipped' | 'failed';
  label: string;
  detail?: string;
}

export interface ProgressFinish {
  errors: number;
  warnings: number;
  reportPaths: MigrationReportPaths;
}

export interface MigrationProgress {
  start(input: ProgressStart): void;
  state(input: ProgressState): void;
  stage(title: string, detail?: string): void;
  plan(summary: MigrationPlanSummary, dryRun: boolean): void;
  item(item: ProgressItem): void;
  finish(input: ProgressFinish): void;
  fail(message: string): void;
}

export const noopProgress: MigrationProgress = {
  start() {},
  state() {},
  stage() {},
  plan() {},
  item() {},
  finish() {},
  fail() {},
};

function formatBytes(value: number): string {
  if (value < 1_024) return `${value} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = value;
  let unit = -1;
  do {
    size /= 1_024;
    unit += 1;
  } while (size >= 1_024 && unit < units.length - 1);
  return `${size >= 10 ? size.toFixed(1) : size.toFixed(2)} ${units[unit]}`;
}

function formatDuration(milliseconds: number): string {
  const seconds = Math.max(0, Math.round(milliseconds / 1_000));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes ? `${minutes}m ${remainder}s` : `${remainder}s`;
}

export class TerminalMigrationProgress implements MigrationProgress {
  private readonly startedAt = Date.now();
  private totalUnits = 0;
  private completedUnits = 0;
  private readonly color: boolean;

  constructor(
    private readonly output: Pick<NodeJS.WriteStream, 'write' | 'isTTY'> = process.stdout,
    color = Boolean(output.isTTY && !process.env.NO_COLOR),
  ) {
    this.color = color;
  }

  private paint(code: number, value: string): string {
    return this.color ? `\u001B[${code}m${value}\u001B[0m` : value;
  }

  private line(value = ''): void {
    this.output.write(`${value}\n`);
  }

  start(input: ProgressStart): void {
    const mode = input.dryRun ? 'DRY RUN · read-only' : 'LIVE MIGRATION';
    this.line();
    this.line(this.paint(36, '╭─────────────────────────────────────────────────────────────╮'));
    this.line(this.paint(36, '│  ywtc · Yandex Wiki  →  Confluence Data Center             │'));
    this.line(this.paint(36, '╰─────────────────────────────────────────────────────────────╯'));
    this.line(`  ${this.paint(input.dryRun ? 33 : 35, mode)}`);
    this.line(`  Source  ${input.source}`);
    this.line(`  Target  ${input.target}`);
    this.line(`  Scope   ${input.singlePage ? 'single page only' : 'source subtree'}`);
    this.line(`  State   ${input.stateFilename}`);
    this.line(`  Fresh   ${input.fresh ? 'yes · prior mappings will be ignored' : 'no · resume when available'}`);
    this.line();
    this.line(this.paint(90, '  Network guardrails'));
    this.line(`  Yandex      ${input.networkLimits.yandex.apiConcurrency} API · ${input.networkLimits.yandex.downloadConcurrency} downloads · ${input.networkLimits.yandex.requestsPerSecond} rps · burst ${input.networkLimits.yandex.burst}`);
    this.line(`  Confluence  ${input.networkLimits.confluence.readConcurrency} read · ${input.networkLimits.confluence.writeConcurrency} write · ${input.networkLimits.confluence.uploadConcurrency} uploads · ${input.networkLimits.confluence.requestsPerSecond} rps · burst ${input.networkLimits.confluence.burst}`);
    this.line(`  Work queue  ${input.orchestrationConcurrency}`);
  }

  state(input: ProgressState): void {
    const source = {
      existing: 'existing mappings loaded',
      new: 'new state',
      fresh: input.dryRun ? 'fresh in-memory state · read-only' : 'fresh state',
    }[input.source];
    this.line();
    this.line(`${this.paint(36, '◆')} ${this.paint(1, 'Migration state')}  ${this.paint(90, `${input.mode} · ${source}`)}`);
    this.line(`  ID      ${input.id}`);
    this.line(`  File    ${input.filename}`);
    if (input.backupFilename) this.line(`  Backup  ${input.backupFilename}`);
    if (input.source === 'fresh') {
      this.line(this.paint(33, '  ⚠ Existing Confluence pages are not adopted; duplicates or suffixed titles may be created.'));
    }
  }

  stage(title: string, detail?: string): void {
    this.line();
    this.line(`${this.paint(36, '◆')} ${this.paint(1, title)}${detail ? this.paint(90, `  ${detail}`) : ''}`);
  }

  plan(summary: MigrationPlanSummary, dryRun: boolean): void {
    this.totalUnits = dryRun ? summary.pages : summary.pages * 2 + summary.attachments;
    const totalLinks = summary.links.internal + summary.links.external + summary.links.attachments + summary.links.anchors;
    const totalImages = summary.images.attached + summary.images.external;
    this.line();
    this.line(this.paint(36, '╭─ Migration plan'));
    this.line(`│ Pages       ${summary.pages} total · ${summary.descendants} descendants · ${summary.pagesToCreate} new · ${summary.pagesToUpdate} resume/update`);
    this.line(`│ Attachments ${summary.attachments} files · ~${formatBytes(summary.attachmentBytes)} API estimate`);
    this.line(`│ Links       ${totalLinks} total · ${summary.links.internal} internal · ${summary.links.external} external · ${summary.links.attachments} attachment · ${summary.links.anchors} anchors`);
    this.line(`│ Images      ${totalImages} total · ${summary.images.attached} attached · ${summary.images.external} external`);
    this.line(`│ Tables      ${summary.staticTables} static · ${summary.dynamicTables} dynamic snapshots · ${summary.dynamicTableRows} grid rows`);
    this.line(`│ Code blocks ${summary.codeBlocks} · Renames ${summary.renamedPages} · Warnings ${summary.warnings}`);
    this.line(this.paint(36, '╰─────────────────────────────────────────────────────────────'));
  }

  item(item: ProgressItem): void {
    this.completedUnits += 1;
    const ratio = this.totalUnits ? Math.min(1, this.completedUnits / this.totalUnits) : 1;
    const percent = Math.round(ratio * 100);
    const width = 20;
    const filled = Math.round(width * ratio);
    const bar = `${'━'.repeat(filled)}${'─'.repeat(width - filled)}`;
    const symbol = item.status === 'failed' ? this.paint(31, '✗')
      : item.status === 'skipped' ? this.paint(33, '○')
        : this.paint(32, '✓');
    const counter = `${String(this.completedUnits).padStart(String(this.totalUnits).length, ' ')}/${this.totalUnits}`;
    this.line(`${this.paint(36, bar)} ${String(percent).padStart(3, ' ')}%  ${symbol} ${counter}  ${item.kind.padEnd(13)} ${item.label}${item.detail ? this.paint(90, `  ${item.detail}`) : ''}`);
  }

  finish(input: ProgressFinish): void {
    const successful = input.errors === 0;
    this.line();
    this.line(`${successful ? this.paint(32, '✓') : this.paint(31, '✗')} ${this.paint(1, successful ? 'Migration run completed' : 'Migration run completed with errors')} ${this.paint(90, `in ${formatDuration(Date.now() - this.startedAt)}`)}`);
    this.line(`  Errors ${input.errors} · Warnings ${input.warnings}`);
    this.line(`  Report ${input.reportPaths.html}`);
    this.line(`  Folder ${input.reportPaths.directory}`);
    this.line(`  JSON   ${input.reportPaths.json}`);
  }

  fail(message: string): void {
    this.line();
    this.line(`${this.paint(31, '✗')} ${this.paint(1, 'Migration aborted')}  ${message}`);
  }
}

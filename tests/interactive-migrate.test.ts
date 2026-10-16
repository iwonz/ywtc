import {spawnSync} from 'node:child_process';
import {access, mkdtemp, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it, vi} from 'vitest';
import type {ParsedMigrationCommand, ReadyMigrationCommand, MigrationCommandOutcome} from '../src/migration-command.js';
import {liveAllowedAfterDryRun, runInteractiveMigration} from '../src/interactive-migrate.js';
import type {TransferReportSummary} from '../src/report.js';
import {
  type SelectPromptOptions,
  type TextPromptOptions,
  type WizardPrompter,
  WizardCancelledError,
} from '../src/wizard-prompts.js';

const config = `defaults: { timeoutMs: 30000, concurrency: 4 }
connections:
  yandex:
    type: yandex-wiki
    apiUrl: https://api.wiki.yandex.net/v1
    webUrl: https://wiki.example.com
    authType: oauth
    token: wiki-token
    organization: { type: yandex360, id: org-1 }
  confluence:
    type: confluence
    deployment: data-center
    baseUrl: https://conf.example.com/confluence
    authType: pat
    token: conf-token
`;

class ScriptedPrompter implements WizardPrompter {
  readonly output: string[] = [];
  readonly initialValues: Array<{id: string; value?: string}> = [];
  readonly optionValues = new Map<string, string[]>();

  constructor(private readonly responses: Record<string, string[]> = {}) {}

  intro(message: string): void { this.output.push(`intro:${message}`); }
  outro(message: string): void { this.output.push(`outro:${message}`); }
  cancel(message: string): void { this.output.push(`cancel:${message}`); }
  note(message: string, title?: string): void { this.output.push(`note:${title ?? ''}:${message}`); }
  info(message: string): void { this.output.push(`info:${message}`); }
  success(message: string): void { this.output.push(`success:${message}`); }
  error(message: string): void { this.output.push(`error:${message}`); }

  private next(id: string, fallback?: string): string {
    const value = this.responses[id]?.shift() ?? fallback;
    if (value === undefined) throw new Error(`No scripted response for ${id}`);
    if (value === '!cancel') throw new WizardCancelledError();
    return value;
  }

  async text(options: TextPromptOptions): Promise<string> {
    this.initialValues.push({id: options.id, ...(options.initialValue !== undefined ? {value: options.initialValue} : {})});
    const value = this.next(options.id, options.initialValue);
    const error = options.validate?.(value);
    if (error) throw new Error(`Invalid scripted value for ${options.id}: ${error}`);
    return value;
  }

  async password(options: TextPromptOptions): Promise<string> {
    return this.text(options);
  }

  async select<T extends string>(options: SelectPromptOptions<T>): Promise<T> {
    this.initialValues.push({id: options.id, ...(options.initialValue !== undefined ? {value: options.initialValue} : {})});
    this.optionValues.set(options.id, options.options.filter((option) => !option.disabled).map((option) => option.value));
    const value = this.next(options.id, options.initialValue);
    if (!options.options.some((option) => option.value === value && !option.disabled)) {
      throw new Error(`Invalid scripted selection for ${options.id}: ${value}`);
    }
    return value as T;
  }

  async task<T>(_message: string, action: () => Promise<T>, _success: (value: T) => string): Promise<T> {
    return action();
  }
}

function command(overrides: Partial<ParsedMigrationCommand> = {}): ParsedMigrationCommand {
  return {
    command: 'migrate',
    interactive: true,
    scope: 'subtree',
    sourceStatus: 'all',
    comments: true,
    archive: false,
    dryRun: false,
    fresh: false,
    openReport: false,
    ...overrides,
  };
}

function summary(overrides: Partial<TransferReportSummary> = {}): TransferReportSummary {
  return {
    pages: 1, returnedDescendants: 0, selectedDescendants: 0, excludedPages: 0, maximumDepth: 0,
    hierarchyGaps: 0, hierarchyRepairs: 0, complete: 1, partial: 0, failed: 0, blocked: 0,
    conflicts: 0, notStartedPages: 0, unprocessedPages: 0, resources: 0, attachments: 0,
    resourceImages: 0, resourcesComplete: 0, resourcesPartial: 0, resourcesFailed: 0,
    resourcesBlocked: 0, resourcesNotStarted: 0, resourcesPlanned: 0, bytes: 0, sourceBytes: 0,
    bytesUnknown: 0, links: 0, images: 0, tables: 0, grids: 0, codeBlocks: 0, cycles: 0,
    normalizations: 0, adaptations: 0, preservedExternalReferences: 0, degradations: 0,
    warnings: 0, errors: 0, rootErrors: 0, dependentPages: 0, dependentFiles: 0,
    dependentComments: 0, retryableFailures: 0, inventoryComplete: true, inventoriedPages: 1,
    inventoryFailedPages: 0, commentThreads: 0, comments: 0, commentParticipants: 0,
    commentAttachments: 0, commentBytes: 0, commentStatuses: {
      complete: 1, partial: 0, failed: 0, conflict: 0, stale: 0, skipped: 0,
      blocked: 0, 'not-started': 0, planned: 0,
    },
    pageStatuses: {
      discovered: 0, planned: 0, 'skeleton-created': 0, complete: 1, partial: 0, conflict: 0,
      failed: 0, blocked: 0, 'not-started': 0,
    },
    resourceStatuses: {planned: 0, complete: 0, partial: 0, failed: 0, blocked: 0, 'not-started': 0},
    traversalStatuses: {resolved: 0, external: 0, inaccessible: 0, broken: 0, cycle: 0, unsupported: 0},
    ...overrides,
  };
}

function outcome(dryRun: boolean, overrides: Partial<TransferReportSummary> = {}): MigrationCommandOutcome {
  const resultSummary = summary(overrides);
  return {
    code: resultSummary.failed || resultSummary.blocked || resultSummary.conflicts ? 1 : 0,
    workspaceRoot: '/workspace',
    reportPaths: {runId: '11111111-1111-4111-8111-111111111111', directory: '/reports/run', html: '/reports/run/index.html', json: '/reports/run/report.json'},
    result: {
      status: dryRun ? 'completed' : 'completed',
      hasErrors: false,
      stateId: 'state',
      stateFilename: '/workspace/.states/state.json',
      reportPaths: {runId: '11111111-1111-4111-8111-111111111111', directory: '/reports/run', html: '/reports/run/index.html', json: '/reports/run/report.json'},
      summary: resultSummary,
    },
  };
}

async function workspace(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ywtc-migrate-wizard-'));
  await writeFile(path.join(root, 'ywtc.config.yaml'), config, {mode: 0o600});
  return root;
}

describe('interactive migration wizard', () => {
  it('uses safe defaults and runs dry-run then live with the same effective request', async () => {
    const root = await workspace();
    const prompter = new ScriptedPrompter({
      'migration.workspace.path': [root],
      'migration.source.locator': ['https://wiki.example.com/start'],
      'migration.destination.locator': ['https://conf.example.com/confluence/pages/viewpage.action?pageId=10'],
      'migration.after-dry-run': ['live'],
    });
    const calls: ReadyMigrationCommand[] = [];
    const result = await runInteractiveMigration({
      command: command(),
      prompter,
      execute: async (request) => {
        calls.push(request);
        return outcome(request.dryRun);
      },
    });
    expect(result.code).toBe(0);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({
      sourceProfile: 'yandex', destinationProfile: 'confluence', scope: 'subtree', sourceStatus: 'all',
      comments: true, archive: false, dryRun: true, workdir: root,
    });
    expect(calls[1]).toEqual({...calls[0], dryRun: false});
  });

  it('prefills flags, retains answers through back navigation, and supports Confluence to Yandex Wiki', async () => {
    const root = await workspace();
    const prompter = new ScriptedPrompter({
      'migration.workspace.path': [root],
      'migration.source.provider': ['confluence', 'confluence'],
      'migration.source.locator': ['https://conf.example.com/confluence/pages/viewpage.action?pageId=20', 'https://conf.example.com/confluence/pages/viewpage.action?pageId=20'],
      'migration.source.profile': ['confluence', 'confluence'],
      'migration.source.navigation': ['continue', 'continue'],
      'migration.destination.kind': ['yandex-wiki', 'yandex-wiki'],
      'migration.destination.locator': ['team/archive', 'team/archive'],
      'migration.destination.profile': ['yandex', 'yandex'],
      'migration.destination.navigation': ['back', 'continue'],
      'migration.review.action': ['live'],
    });
    const execute = vi.fn(async (request: ReadyMigrationCommand) => outcome(request.dryRun));
    await runInteractiveMigration({
      command: command({
        workdir: root,
        source: 'https://conf.example.com/confluence/pages/viewpage.action?pageId=20',
        sourceProfile: 'confluence',
        destination: 'team/archive',
        destinationProfile: 'yandex',
        scope: 'linked',
        comments: false,
      }),
      prompter,
      execute,
    });
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      sourceProfile: 'confluence', destinationProfile: 'yandex', scope: 'linked', comments: false, dryRun: false,
    }));
    expect(prompter.initialValues).toContainEqual({id: 'migration.source.locator', value: 'https://conf.example.com/confluence/pages/viewpage.action?pageId=20'});
  });

  it.each(['markdown', 'html'] as const)('configures %s output and conditional ZIP archive', async (format) => {
    const root = await workspace();
    const prompter = new ScriptedPrompter({
      'migration.workspace.path': [root],
      'migration.source.locator': ['team/start'],
      'migration.destination.kind': [format],
      'migration.destination.directory': [`./exports/${format}`],
      'migration.archive': ['yes'],
      'migration.review.action': ['live'],
    });
    const execute = vi.fn(async (request: ReadyMigrationCommand) => outcome(request.dryRun));
    await runInteractiveMigration({command: command(), prompter, execute});
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      destination: `./exports/${format}`, format, archive: true,
    }));
  });

  it('hides live after a blocking dry-run but allows warnings and adaptations', async () => {
    expect(liveAllowedAfterDryRun(summary({warnings: 3, adaptations: 2, degradations: 1, errors: 2}))).toBe(true);
    expect(liveAllowedAfterDryRun(summary({inventoryComplete: false}))).toBe(false);
    expect(liveAllowedAfterDryRun(summary({rootErrors: 1}))).toBe(false);
    expect(liveAllowedAfterDryRun(summary({failed: 1}))).toBe(false);
    expect(liveAllowedAfterDryRun(summary({blocked: 1}))).toBe(false);
    expect(liveAllowedAfterDryRun(summary({conflicts: 1}))).toBe(false);

    const root = await workspace();
    const prompter = new ScriptedPrompter({
      'migration.workspace.path': [root],
      'migration.source.locator': ['team/start'],
      'migration.destination.locator': ['10'],
      'migration.after-dry-run': ['exit'],
    });
    const result = await runInteractiveMigration({
      command: command(),
      prompter,
      execute: async (request) => outcome(request.dryRun, {blocked: 1, complete: 0}),
    });
    expect(result.code).toBe(1);
    expect(prompter.optionValues.get('migration.after-dry-run')).not.toContain('live');
  });

  it('returns to migration after nested init prepares a missing workspace', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ywtc-migrate-init-'));
    const initialize = vi.fn(async (selected: string) => {
      await writeFile(path.join(selected, 'ywtc.config.yaml'), config, {mode: 0o600});
      return {code: 0, status: 'completed'};
    });
    const prompter = new ScriptedPrompter({
      'migration.workspace.path': [root],
      'migration.workspace.unavailable': ['configure'],
      'migration.source.locator': ['team/start'],
      'migration.destination.locator': ['10'],
      'migration.review.action': ['exit'],
    });
    const result = await runInteractiveMigration({command: command(), prompter, initialize});
    expect(result).toMatchObject({status: 'exited', code: 0});
    expect(initialize).toHaveBeenCalledWith(root, prompter);
  });

  it('cancels without running an operation', async () => {
    const root = await workspace();
    const execute = vi.fn();
    const result = await runInteractiveMigration({
      command: command(),
      prompter: new ScriptedPrompter({'migration.workspace.path': [root], 'migration.source.provider': ['!cancel']}),
      execute,
    });
    expect(result).toMatchObject({status: 'cancelled', code: 130});
    expect(execute).not.toHaveBeenCalled();
  });

  it('rejects non-TTY use before creating a workspace', async () => {
    const parent = await mkdtemp(path.join(os.tmpdir(), 'ywtc-migrate-nontty-'));
    const root = path.join(parent, 'workspace');
    const run = spawnSync(process.execPath, [
      '--import', 'tsx', path.resolve('src/cli.ts'), 'migrate', '-i', '-w', root,
    ], {cwd: process.cwd(), encoding: 'utf8'});
    expect(run.status).toBe(2);
    expect(run.stderr).toContain('migrate --interactive requires an interactive TTY');
    await expect(access(root)).rejects.toThrow();
  });
});

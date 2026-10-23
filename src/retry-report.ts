import {access, readdir, readFile, realpath} from 'node:fs/promises';
import path from 'node:path';
import {z} from 'zod';
import type {TransferInvocation, TransferReportData} from './report-contract.js';

const runIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const terminalStatus = z.enum(['completed', 'completed-with-warnings', 'partial', 'failed', 'cancelled', 'interrupted']);
const resourceSchema = z.object({
  sourceId: z.string(), sourceName: z.string(), kind: z.string(), status: z.string(),
}).passthrough();
const commentsSchema = z.object({status: z.string()}).passthrough();
const pageSchema = z.object({
  sourceCanonicalId: z.string(), sourceId: z.string(), sourceTitle: z.string(), sourceUrl: z.string(),
  depth: z.number(), status: z.string(), inventoryStatus: z.string(), resourceItems: z.array(resourceSchema), comments: commentsSchema,
}).passthrough();
const issueSchema = z.object({
  code: z.string(), severity: z.string(), phase: z.string(), retryable: z.boolean(), occurrences: z.number(), message: z.string(),
}).passthrough();
const invocationSchema = z.object({
  rewrite: z.boolean().optional(),
  source: z.object({locator: z.string(), profile: z.string()}).strict(),
  destination: z.discriminatedUnion('type', [
    z.object({type: z.literal('remote'), locator: z.string(), profile: z.string()}).strict(),
    z.object({type: z.literal('directory'), path: z.string(), format: z.enum(['markdown', 'html'])}).strict(),
  ]),
  scope: z.enum(['page', 'subtree', 'linked']), sourceStatus: z.enum(['all', 'current']), comments: z.boolean(), archive: z.boolean(),
  state: z.object({mode: z.enum(['automatic', 'explicit']), path: z.string()}).strict(),
}).strict();
const retrySchema = z.object({
  rootRunId: z.string().regex(runIdPattern), parentRunId: z.string().regex(runIdPattern), attempt: z.number().int().positive(),
  selectedPages: z.number().int().nonnegative(), selectedResources: z.number().int().nonnegative(), selectedComments: z.number().int().nonnegative(),
  contextPages: z.number().int().nonnegative(), carriedForward: z.number().int().nonnegative(),
  remainingRetryable: z.number().int().nonnegative(), remainingTerminal: z.number().int().nonnegative(), preview: z.boolean(),
}).strict();
const reportSchema = z.object({
  runId: z.string().regex(runIdPattern), startedAt: z.string(), finishedAt: z.string().optional(),
  status: z.union([terminalStatus, z.literal('running')]), dryRun: z.boolean(), commentsEnabled: z.boolean(),
  scope: z.enum(['page', 'subtree', 'linked']), sourceStatus: z.enum(['all', 'current']), direction: z.string(),
  source: z.object({provider: z.enum(['yandex-wiki', 'confluence']), profile: z.string(), rootId: z.string(), title: z.string(), url: z.string()}).passthrough(),
  destination: z.object({provider: z.enum(['yandex-wiki', 'confluence', 'filesystem']), profile: z.string().optional(), id: z.string(), url: z.string().optional(), format: z.string().optional()}).passthrough(),
  state: z.object({id: z.string(), path: z.string(), mode: z.enum(['automatic', 'explicit']), source: z.string()}).passthrough(),
  invocation: invocationSchema.optional(), retry: retrySchema.optional(), pages: z.array(pageSchema), excludedPages: z.array(z.unknown()),
  edges: z.array(z.unknown()), hierarchyRepairs: z.array(z.unknown()), warnings: z.array(z.string()), errors: z.array(z.string()),
  issues: z.array(issueSchema), outputs: z.array(z.object({label: z.string(), value: z.string()})), summary: z.object({
    inventoryComplete: z.boolean(), inventoryRemainingFailures: z.number().optional().default(0), complete: z.number(), partial: z.number(),
    failed: z.number(), blocked: z.number(), conflicts: z.number(), notStartedPages: z.number().optional().default(0),
  }).passthrough(),
}).passthrough();

function contained(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

async function readReport(reportsDirectory: string, runId: string): Promise<TransferReportData> {
  if (!runIdPattern.test(runId)) throw new Error('Retry Run ID must be a canonical UUID shown by "ywtc reports list".');
  const directory = path.resolve(reportsDirectory, runId);
  if (!contained(reportsDirectory, directory)) throw new Error('Retry report path escapes the selected workspace.');
  try {
    const [realReportsDirectory, realDirectory] = await Promise.all([realpath(reportsDirectory), realpath(directory)]);
    if (!contained(realReportsDirectory, realDirectory)) throw new Error('Retry report path escapes the selected workspace.');
  } catch (error) {
    if (error instanceof Error && error.message === 'Retry report path escapes the selected workspace.') throw error;
    throw new Error(`Retry report ${runId} was not found in ${reportsDirectory}.`, {cause: error});
  }
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(path.join(directory, 'report.json'), 'utf8'));
  } catch (error) {
    throw new Error(`Retry report ${runId} was not found or is not valid JSON in ${reportsDirectory}.`, {cause: error});
  }
  const parsed = reportSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(`Retry report ${runId} is invalid at ${issue?.path.join('.') || 'report'}: ${issue?.message ?? 'invalid current report'}.`);
  }
  if (parsed.data.runId !== runId) throw new Error(`Retry report ${runId} contains another Run ID.`);
  if (parsed.data.status === 'running') throw new Error(`Retry report ${runId} is still running and cannot be continued yet.`);
  return parsed.data as unknown as TransferReportData;
}

function reconstructInvocation(report: TransferReportData): TransferInvocation {
  if (report.invocation) {
    const invocation = report.invocation;
    const destinationMatches = report.destination.provider === 'filesystem'
      ? invocation.destination.type === 'directory'
        && path.resolve(invocation.destination.path) === path.resolve(report.destination.id)
        && invocation.destination.format === report.destination.format
      : invocation.destination.type === 'remote'
        && invocation.destination.profile === report.destination.profile;
    if (
      invocation.source.profile !== report.source.profile
      || !destinationMatches
      || path.resolve(invocation.state.path) !== path.resolve(report.state.path)
      || invocation.state.mode !== report.state.mode
    ) {
      throw new Error(`Retry report ${report.runId} contains inconsistent invocation, profile, destination, or state evidence.`);
    }
    return invocation;
  }
  let destination: TransferInvocation['destination'];
  let archive = false;
  if (report.destination.provider === 'filesystem') {
    if (report.destination.format !== 'html' && report.destination.format !== 'markdown') {
      throw new Error(`Retry report ${report.runId} does not contain enough destination evidence to restore the migration.`);
    }
    destination = {type: 'directory', path: report.destination.id, format: report.destination.format};
    archive = report.outputs.some((output) => output.label.toLowerCase() === 'archive');
    if (!archive) {
      throw new Error(`Retry report ${report.runId} does not contain enough archive-policy evidence to restore this filesystem migration.`);
    }
  } else {
    if (!report.destination.profile || !report.destination.url) {
      throw new Error(`Retry report ${report.runId} does not contain enough destination evidence to restore the migration.`);
    }
    destination = {type: 'remote', locator: report.destination.url, profile: report.destination.profile};
  }
  return {
    source: {locator: report.source.url, profile: report.source.profile},
    destination,
    scope: report.scope,
    sourceStatus: report.sourceStatus,
    comments: report.commentsEnabled,
    archive,
    state: {mode: report.state.mode, path: report.state.path},
  };
}

export interface RetryBaseline {
  requested: TransferReportData;
  baseline: TransferReportData;
  rootRunId: string;
  attempt: number;
  invocation: TransferInvocation;
}

export async function resolveRetryBaseline(reportsDirectory: string, runId: string, workspaceRoot: string): Promise<RetryBaseline> {
  const requested = await readReport(reportsDirectory, runId);
  if (requested.dryRun && !requested.retry) throw new Error(`Run ${runId} is a migration dry-run and has no attempted outcomes to retry.`);
  const rootRunId = requested.retry?.rootRunId ?? requested.runId;
  let names: string[] = [];
  try {
    names = await readdir(reportsDirectory);
  } catch (error) {
    throw new Error(`Cannot read reports from ${reportsDirectory}.`, {cause: error});
  }
  const lineage: TransferReportData[] = [];
  for (const name of names) {
    if (!runIdPattern.test(name)) continue;
    try {
      const candidate = await readReport(reportsDirectory, name);
      if (candidate.dryRun) continue;
      if (candidate.runId === rootRunId || candidate.retry?.rootRunId === rootRunId) lineage.push(candidate);
    } catch {
      // The catalog owns corrupt-report warnings; unrelated invalid reports do not poison this lineage.
    }
  }
  const baseline = lineage.sort((left, right) => Date.parse(right.finishedAt ?? right.startedAt) - Date.parse(left.finishedAt ?? left.startedAt))[0];
  if (!baseline) throw new Error(`No terminal live report exists for retry lineage ${rootRunId}.`);
  const invocation = reconstructInvocation(baseline);
  if (!contained(workspaceRoot, invocation.state.path)) throw new Error(`Retry state path is outside the selected workspace: ${invocation.state.path}.`);
  await access(invocation.state.path).catch((error) => { throw new Error(`Retry state is missing: ${invocation.state.path}.`, {cause: error}); });
  const [realWorkspace, realState] = await Promise.all([realpath(workspaceRoot), realpath(invocation.state.path)]);
  if (!contained(realWorkspace, realState)) throw new Error(`Retry state path is outside the selected workspace: ${invocation.state.path}.`);
  return {
    requested,
    baseline,
    rootRunId,
    attempt: Math.max(0, ...lineage.map((report) => report.retry?.attempt ?? 0)) + 1,
    invocation,
  };
}

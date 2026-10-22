import {access, readdir, readFile} from 'node:fs/promises';
import type {Dirent} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import open from 'open';
import {z} from 'zod';
import type {MigrationReportPaths} from './report.js';

const runIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const reportListSchema = z.object({
  runId: z.string().regex(runIdPattern),
  startedAt: z.string(),
  finishedAt: z.string().optional(),
  status: z.enum(['running', 'completed', 'completed-with-warnings', 'partial', 'failed', 'cancelled', 'interrupted']),
  dryRun: z.boolean(),
  scope: z.enum(['page', 'subtree', 'linked']),
  sourceStatus: z.enum(['all', 'current']).optional().default('all'),
  direction: z.string(),
  retry: z.object({
    rootRunId: z.string().regex(runIdPattern), parentRunId: z.string().regex(runIdPattern), attempt: z.number().int().positive(),
    selectedPages: z.number().nonnegative(), selectedResources: z.number().nonnegative(), selectedComments: z.number().nonnegative(),
    contextPages: z.number().nonnegative(), carriedForward: z.number().nonnegative(), remainingRetryable: z.number().nonnegative(),
    remainingTerminal: z.number().nonnegative(), preview: z.boolean(),
  }).optional(),
  warnings: z.array(z.string()),
  errors: z.array(z.string()),
  summary: z.object({
    pages: z.number().nonnegative(),
    returnedDescendants: z.number().nonnegative().optional().default(0),
    selectedDescendants: z.number().nonnegative().optional().default(0),
    excludedPages: z.number().nonnegative().optional().default(0),
    maximumDepth: z.number().nonnegative().optional().default(0),
    hierarchyGaps: z.number().nonnegative().optional().default(0),
    hierarchyRepairs: z.number().nonnegative().optional().default(0),
    complete: z.number().nonnegative(),
    partial: z.number().nonnegative(),
    failed: z.number().nonnegative(),
    blocked: z.number().nonnegative(),
    conflicts: z.number().nonnegative(),
    notStartedPages: z.number().nonnegative().optional().default(0),
    unprocessedPages: z.number().nonnegative(),
    resources: z.number().nonnegative(),
    resourcesComplete: z.number().nonnegative(),
    resourcesPartial: z.number().nonnegative(),
    resourcesFailed: z.number().nonnegative(),
    resourcesBlocked: z.number().nonnegative().optional().default(0),
    resourcesNotStarted: z.number().nonnegative().optional().default(0),
    resourcesPlanned: z.number().nonnegative(),
    inventoryComplete: z.boolean(),
    inventoryReusedPages: z.number().nonnegative().optional().default(0),
    inventoryFreshPages: z.number().nonnegative().optional().default(0),
    inventoryPendingPages: z.number().nonnegative().optional().default(0),
    inventoryRecoveryAttempts: z.number().nonnegative().optional().default(0),
    inventoryRemainingFailures: z.number().nonnegative().optional().default(0),
    degradations: z.number().nonnegative(),
    adaptations: z.number().nonnegative().optional().default(0),
    preservedExternalReferences: z.number().nonnegative().optional().default(0),
    warnings: z.number().nonnegative(),
    errors: z.number().nonnegative(),
    rootErrors: z.number().nonnegative().optional(),
    dependentPages: z.number().nonnegative().optional().default(0),
    dependentFiles: z.number().nonnegative().optional().default(0),
    dependentComments: z.number().nonnegative().optional().default(0),
    commentThreads: z.number().nonnegative().optional().default(0),
    comments: z.number().nonnegative().optional().default(0),
    commentParticipants: z.number().nonnegative().optional().default(0),
    commentAttachments: z.number().nonnegative().optional().default(0),
    commentBytes: z.number().nonnegative().optional().default(0),
    commentStatuses: z.record(z.string(), z.number().nonnegative()).optional().default({}),
    mentionMode: z.enum(['off', 'template', 'auto']).optional(),
    pageMentions: z.number().nonnegative().optional().default(0),
    commentMentions: z.number().nonnegative().optional().default(0),
    mentionIdentities: z.number().nonnegative().optional().default(0),
    mentionOutcomes: z.record(z.string(), z.number().nonnegative()).optional().default({}),
  }),
});

export interface ReportCatalogEntry {
  runId: string;
  startedAt: string;
  finishedAt?: string;
  status: z.infer<typeof reportListSchema>['status'];
  dryRun: boolean;
  scope: z.infer<typeof reportListSchema>['scope'];
  sourceStatus: z.infer<typeof reportListSchema>['sourceStatus'];
  direction: string;
  pages: number;
  returnedDescendants: number;
  selectedDescendants: number;
  excludedPages: number;
  maximumDepth: number;
  hierarchyGaps: number;
  hierarchyRepairs: number;
  complete: number;
  partial: number;
  failed: number;
  blocked: number;
  conflicts: number;
  notStartedPages: number;
  unprocessedPages: number;
  resources: number;
  resourcesComplete: number;
  resourcesPartial: number;
  resourcesFailed: number;
  resourcesBlocked: number;
  resourcesNotStarted: number;
  resourcesPlanned: number;
  inventoryComplete: boolean;
  inventoryReusedPages: number;
  inventoryFreshPages: number;
  inventoryPendingPages: number;
  inventoryRecoveryAttempts: number;
  inventoryRemainingFailures: number;
  degradations: number;
  adaptations: number;
  preservedExternalReferences: number;
  warnings: number;
  errors: number;
  rootErrors: number;
  dependentPages: number;
  dependentFiles: number;
  dependentComments: number;
  commentThreads: number;
  comments: number;
  commentParticipants: number;
  commentAttachments: number;
  commentBytes: number;
  commentStatuses: Record<string, number>;
  mentionMode?: 'off' | 'template' | 'auto';
  pageMentions: number;
  commentMentions: number;
  mentionIdentities: number;
  mentionOutcomes: Record<string, number>;
  directory: string;
  html: string;
  json: string;
  url: string;
  retry?: z.infer<typeof reportListSchema>['retry'];
}

export interface ReportCatalogResult {
  reports: ReportCatalogEntry[];
  warnings: string[];
}

export type ReportOpener = (url: string) => Promise<unknown>;

function containedPath(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function timestamp(entry: ReportCatalogEntry): number {
  const value = Date.parse(entry.finishedAt ?? entry.startedAt);
  return Number.isFinite(value) ? value : 0;
}

function shellQuoted(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function reportOpenCommand(runId: string, workdir: string): string {
  if (!runIdPattern.test(runId)) throw new Error('Report run ID must be a canonical UUID.');
  return `ywtc reports open ${runId} --workdir ${shellQuoted(path.resolve(workdir))}`;
}

export function reportAccessDetails(paths: MigrationReportPaths, workdir: string): {
  runId: string;
  report: string;
  url: string;
  command: string;
} {
  return {
    runId: paths.runId,
    report: paths.html,
    url: pathToFileURL(paths.html).href,
    command: reportOpenCommand(paths.runId, workdir),
  };
}

function reportReadError(error: unknown): string {
  if (error instanceof z.ZodError) {
    const first = error.issues[0];
    if (!first) return 'invalid current report';
    const location = first.path.length > 0 ? first.path.join('.') : 'report';
    const remaining = error.issues.length - 1;
    return `invalid current report at ${location}: ${first.message}${remaining > 0 ? ` (+${remaining} more issues)` : ''}`;
  }
  return error instanceof Error ? error.message : String(error);
}

async function readEntry(reportsDirectory: string, directoryName: string): Promise<ReportCatalogEntry> {
  if (!runIdPattern.test(directoryName)) throw new Error('directory name is not a canonical run ID');
  const directory = path.resolve(reportsDirectory, directoryName);
  if (!containedPath(reportsDirectory, directory)) throw new Error('report path escapes the reports directory');
  const json = path.join(directory, 'report.json');
  const html = path.join(directory, 'index.html');
  await access(html);
  const parsed = reportListSchema.parse(JSON.parse(await readFile(json, 'utf8')));
  if (parsed.runId !== directoryName) throw new Error('report run ID does not match its directory');
  return {
    runId: parsed.runId,
    startedAt: parsed.startedAt,
    ...(parsed.finishedAt ? {finishedAt: parsed.finishedAt} : {}),
    status: parsed.status,
    dryRun: parsed.dryRun,
    scope: parsed.scope,
    sourceStatus: parsed.sourceStatus,
    direction: parsed.direction,
    pages: parsed.summary.pages,
    returnedDescendants: parsed.summary.returnedDescendants,
    selectedDescendants: parsed.summary.selectedDescendants,
    excludedPages: parsed.summary.excludedPages,
    maximumDepth: parsed.summary.maximumDepth,
    hierarchyGaps: parsed.summary.hierarchyGaps,
    hierarchyRepairs: parsed.summary.hierarchyRepairs,
    complete: parsed.summary.complete,
    partial: parsed.summary.partial,
    failed: parsed.summary.failed,
    blocked: parsed.summary.blocked,
    conflicts: parsed.summary.conflicts,
    notStartedPages: parsed.summary.notStartedPages,
    unprocessedPages: parsed.summary.unprocessedPages,
    resources: parsed.summary.resources,
    resourcesComplete: parsed.summary.resourcesComplete,
    resourcesPartial: parsed.summary.resourcesPartial,
    resourcesFailed: parsed.summary.resourcesFailed,
    resourcesBlocked: parsed.summary.resourcesBlocked,
    resourcesNotStarted: parsed.summary.resourcesNotStarted,
    resourcesPlanned: parsed.summary.resourcesPlanned,
    inventoryComplete: parsed.summary.inventoryComplete,
    inventoryReusedPages: parsed.summary.inventoryReusedPages,
    inventoryFreshPages: parsed.summary.inventoryFreshPages,
    inventoryPendingPages: parsed.summary.inventoryPendingPages,
    inventoryRecoveryAttempts: parsed.summary.inventoryRecoveryAttempts,
    inventoryRemainingFailures: parsed.summary.inventoryRemainingFailures,
    degradations: parsed.summary.degradations,
    adaptations: parsed.summary.adaptations,
    preservedExternalReferences: parsed.summary.preservedExternalReferences,
    warnings: parsed.summary.warnings,
    errors: parsed.summary.errors,
    rootErrors: parsed.summary.rootErrors ?? parsed.summary.errors,
    dependentPages: parsed.summary.dependentPages,
    dependentFiles: parsed.summary.dependentFiles,
    dependentComments: parsed.summary.dependentComments,
    commentThreads: parsed.summary.commentThreads,
    comments: parsed.summary.comments,
    commentParticipants: parsed.summary.commentParticipants,
    commentAttachments: parsed.summary.commentAttachments,
    commentBytes: parsed.summary.commentBytes,
    commentStatuses: parsed.summary.commentStatuses,
    ...(parsed.summary.mentionMode ? {mentionMode: parsed.summary.mentionMode} : {}),
    pageMentions: parsed.summary.pageMentions,
    commentMentions: parsed.summary.commentMentions,
    mentionIdentities: parsed.summary.mentionIdentities,
    mentionOutcomes: parsed.summary.mentionOutcomes,
    directory,
    html,
    json,
    url: pathToFileURL(html).href,
    ...(parsed.retry ? {retry: parsed.retry} : {}),
  };
}

export async function listReports(reportsDirectory: string): Promise<ReportCatalogResult> {
  let entries: Dirent[];
  try {
    entries = await readdir(reportsDirectory, {withFileTypes: true});
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {reports: [], warnings: []};
    throw error;
  }
  const reports: ReportCatalogEntry[] = [];
  const warnings: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      reports.push(await readEntry(reportsDirectory, entry.name));
    } catch (error) {
      warnings.push(`Skipped report ${entry.name}: ${reportReadError(error)}`);
    }
  }
  reports.sort((left, right) => timestamp(right) - timestamp(left) || right.runId.localeCompare(left.runId));
  return {reports, warnings};
}

export async function selectReport(reportsDirectory: string, runId?: string): Promise<{report: ReportCatalogEntry; warnings: string[]}> {
  const latest = runId === undefined || runId === 'last';
  if (!latest && !runIdPattern.test(runId)) {
    throw new Error('Report selector must be "last" or a canonical UUID shown by "ywtc reports list".');
  }
  const catalog = await listReports(reportsDirectory);
  const report = latest ? catalog.reports[0] : catalog.reports.find((entry) => entry.runId === runId);
  if (!report) {
    throw new Error(!latest
      ? `Report ${runId} was not found in ${reportsDirectory}. Run "ywtc reports list" to inspect available reports.`
      : `No valid reports were found in ${reportsDirectory}. Run a migration first.`);
  }
  return {report, warnings: catalog.warnings};
}

export async function openReportFile(html: string, opener: ReportOpener = (url) => open(url, {wait: false})): Promise<string> {
  const url = pathToFileURL(path.resolve(html)).href;
  try {
    await opener(url);
    return url;
  } catch (error) {
    throw new Error(`Could not open the report in the system browser. Open ${url} manually. ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function openSelectedReport(
  reportsDirectory: string,
  runId?: string,
  opener?: ReportOpener,
): Promise<{report: ReportCatalogEntry; warnings: string[]}> {
  const selected = await selectReport(reportsDirectory, runId);
  await openReportFile(selected.report.html, opener);
  return selected;
}

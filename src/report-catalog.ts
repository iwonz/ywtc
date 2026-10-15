import {access, readdir, readFile} from 'node:fs/promises';
import type {Dirent} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import open from 'open';
import {z} from 'zod';

const runIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const reportListSchema = z.object({
  runId: z.string().regex(runIdPattern),
  startedAt: z.string(),
  finishedAt: z.string().optional(),
  status: z.enum(['running', 'completed', 'completed-with-warnings', 'partial', 'failed', 'cancelled', 'interrupted']),
  dryRun: z.boolean(),
  scope: z.enum(['page', 'subtree', 'linked']),
  direction: z.string(),
  warnings: z.array(z.string()),
  errors: z.array(z.string()),
  summary: z.object({
    pages: z.number().nonnegative(),
    complete: z.number().nonnegative(),
    partial: z.number().nonnegative(),
    failed: z.number().nonnegative(),
    warnings: z.number().nonnegative().optional(),
    errors: z.number().nonnegative().optional(),
  }),
});

export interface ReportCatalogEntry {
  runId: string;
  startedAt: string;
  finishedAt?: string;
  status: z.infer<typeof reportListSchema>['status'];
  dryRun: boolean;
  scope: z.infer<typeof reportListSchema>['scope'];
  direction: string;
  pages: number;
  complete: number;
  partial: number;
  failed: number;
  warnings: number;
  errors: number;
  directory: string;
  html: string;
  json: string;
  url: string;
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
    direction: parsed.direction,
    pages: parsed.summary.pages,
    complete: parsed.summary.complete,
    partial: parsed.summary.partial,
    failed: parsed.summary.failed,
    warnings: parsed.summary.warnings ?? parsed.warnings.length,
    errors: parsed.summary.errors ?? parsed.errors.length,
    directory,
    html,
    json,
    url: pathToFileURL(html).href,
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
      warnings.push(`Skipped report ${entry.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  reports.sort((left, right) => timestamp(right) - timestamp(left) || right.runId.localeCompare(left.runId));
  return {reports, warnings};
}

export async function selectReport(reportsDirectory: string, runId?: string): Promise<{report: ReportCatalogEntry; warnings: string[]}> {
  if (runId !== undefined && !runIdPattern.test(runId)) {
    throw new Error('Report run ID must be a canonical UUID shown by "ywtc reports list".');
  }
  const catalog = await listReports(reportsDirectory);
  const report = runId ? catalog.reports.find((entry) => entry.runId === runId) : catalog.reports[0];
  if (!report) {
    throw new Error(runId
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

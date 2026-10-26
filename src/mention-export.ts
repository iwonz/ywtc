import {chmod, lstat, mkdir, mkdtemp, open, readdir, readFile, rename, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import PQueue from 'p-queue';
import {CooperativeScheduler} from './cooperative.js';
import {type CommentEntry, IncompleteSourceDiscoveryError, type SourceAdapter, type SourcePage, type SourceStatus, type TransferScope} from './domain.js';
import {discoverPageGraph} from './graph.js';
import {HttpRequestError} from './http.js';
import {profileBaseUrl} from './locators.js';
import {redact} from './logger.js';
import {canonicalMentionInstance, decisionIdentityKey, type MentionDecisionDocument, type MentionDecisionEntry, type MentionInventoryIssue, type MentionOccurrence, parseMentionDecisions } from './mention-decisions.js';
import {scanMentions} from './mentions.js';
import {SourceInventoryOperationError} from './source-inventory.js';

export async function collectMentionDecisions(input: {
  adapter: SourceAdapter; locator: string; scope: TransferScope; sourceStatus: SourceStatus;
  comments: boolean; concurrency: number; signal?: AbortSignal; secrets?: string[];
  onProgress?: (message: string) => void;
}): Promise<MentionDecisionDocument> {
  const {adapter, signal} = input, scheduler = new CooperativeScheduler();
  const issues: MentionInventoryIssue[] = [], entries = new Map<string, MentionDecisionEntry>();
  const checkpoint = new Map<string, SourcePage>();
  let pages: SourcePage[] = [], selectedPages = 0, scannedPages = 0, scannedComments = 0;
  const issue = (phase: MentionInventoryIssue['phase'], code: string, error: unknown, pageId?: string, retryable?: boolean) => {
    issues.push({phase, code, message: redact(error, input.secrets ?? []), retryable: retryable ?? (error instanceof SourceInventoryOperationError ? error.retryable : error instanceof HttpRequestError && (error.status === undefined || error.status === 429 || error.status >= 500)), ...(pageId ? {pageId} : {})});
  };
  try {
    await scheduler.checkpoint({force: true, ...(signal ? {signal} : {})});
    await adapter.preflight();
    const root = await adapter.resolvePage(input.locator);
    checkpoint.set(root.id, root);selectedPages = 1;
    const graph = await discoverPageGraph({adapter, root, scope: input.scope, sourceStatus: input.sourceStatus,
      ...(signal ? {signal} : {}), checkpoint: {
        loadPage: async id => checkpoint.get(id),
        savePage: async page => {checkpoint.set(page.id, page);},
      }, onProgress: progress => input.onProgress?.(`Discovering mentions · ${progress.pages} pages`),
    });
    pages = graph.pages;selectedPages = pages.length;
    for (const warning of graph.warnings) issue('discovery', 'mention-discovery-incomplete', warning);
    for (const edge of graph.edges) if (['broken', 'inaccessible'].includes(edge.status)) issue('discovery', 'mention-linked-page-unread', edge.message ?? `Cannot resolve source reference ${edge.raw}`);
  } catch (error) {
    if (error instanceof IncompleteSourceDiscoveryError) {
      const failed = new Set(error.failures.map(item => item.page.id));
      selectedPages = error.pages.length;
      pages = error.pages.filter(page => !failed.has(page.id));
      for (const failure of error.failures) issue('discovery', failure.code, failure.message, failure.page.id, failure.retryable);
    } else {
      pages = [...checkpoint.values()];selectedPages = Math.max(selectedPages, pages.length);
      issue('discovery', 'mention-discovery-incomplete', error);
    }
  }
  const scan = (page: SourcePage, content: string, location: MentionOccurrence['location'], commentId?: string, format = page.rawFormat) => {
    const found = scanMentions(content, format);
    for (const mention of found.mentions) {
      const key = decisionIdentityKey(mention.identity);
      if (!key) {issue(location === 'page' ? 'page' : 'comment', 'mention-identity-missing', 'Mention has no usable source identifier; its source representation is retained.', page.id, false);continue;}
      let entry = entries.get(key);
      if (!entry) {
        const {username, accountId, userKey, id} = mention.identity;
        entry = {identity: {...(username ? {username} : {}), ...(accountId ? {accountId} : {}), ...(userKey ? {userKey} : {}), ...(id ? {id} : {})}, mention: mention.identity.source, decision: 'skip', occurrences: []};
        entries.set(key, entry);
      }
      const existing = entry.occurrences?.find(item => item.pageId === page.id && item.location === location && item.commentId === commentId);
      if (existing) existing.count += 1;
      else entry.occurrences!.push({pageId: page.id, pageTitle: page.title, pageUrl: page.url, location, ...(commentId ? {commentId} : {}), count: 1});
    }
  };
  const queue = new PQueue({concurrency: input.concurrency});
  await Promise.all(pages.map(page => queue.add(async () => {
    if (signal?.aborted) return;
    try {
      await scheduler.checkpoint(signal ? {signal} : {});
      if (page.contentAvailability?.status === 'provider-unavailable') throw new Error(`Source body unavailable: ${page.contentAvailability.reason}`);
      scan(page, page.rawContent, 'page');scannedPages += 1;
    } catch (error) {issue('page', 'mention-page-scan-failed', error, page.id);}
    if (input.comments && !signal?.aborted) {
      try {
        if (!adapter.readComments) throw new Error('Source does not support comment reads');
        const inventory = await adapter.readComments(page);
        if (inventory.status === 'failed' || inventory.status === 'skipped') throw new Error(inventory.error ?? 'Source comments were not read');
        for (const warning of inventory.warnings) issue('comment', 'mention-comment-inventory-incomplete', warning, page.id, false);
        const stack: CommentEntry[] = inventory.threads.map(thread => thread.root).reverse();
        const visited = new Set<string>();
        while (stack.length) {
          await scheduler.checkpoint(signal ? {signal} : {});
          const comment = stack.pop()!;
          if (visited.has(comment.id)) {issue('comment', 'mention-comment-duplicate', 'Repeated comment identity', page.id, false);continue;}
          visited.add(comment.id);
          scan(page, [comment.inlineContext ?? '', comment.body].join('\n'), 'comment', comment.id, comment.bodyFormat ?? page.rawFormat);
          scannedComments += 1;stack.push(...[...comment.replies].reverse());
        }
      } catch (error) {issue('comment', 'mention-comments-read-failed', error, page.id);}
    }
    input.onProgress?.(`Scanning mentions · ${scannedPages}/${selectedPages} pages · ${scannedComments} comments · ${entries.size} identities`);
  })));
  if (signal?.aborted) issue('discovery', 'mention-export-interrupted', signal.reason ?? 'Interrupted', undefined, true);
  for (const entry of entries.values()) entry.occurrences?.sort((a, b) => a.pageId.localeCompare(b.pageId) || a.location.localeCompare(b.location) || (a.commentId ?? '').localeCompare(b.commentId ?? ''));
  return parseMentionDecisions({source: {provider: adapter.kind, instance: canonicalMentionInstance(profileBaseUrl(adapter.profile))},
    entries: [...entries].sort(([a], [b]) => a.localeCompare(b)).map(([, entry]) => entry),
    inventory: {complete: issues.length === 0 && scannedPages === selectedPages, selectedPages, scannedPages, scannedComments, issues},
  });
}

export const MENTION_DATA_MARKER = '{"__ywtc_mentions_payload__":true}';
export function embedMentionDocument(shell: string, document: MentionDecisionDocument): string {
  if (shell.split(MENTION_DATA_MARKER).length !== 2) throw new Error('Mention editor must contain exactly one data placeholder');
  const serialized = JSON.stringify(document).replaceAll('&', '\\u0026').replaceAll('<', '\\u003c').replaceAll('>', '\\u003e').replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029');
  return shell.replace(MENTION_DATA_MARKER, () => serialized);
}

async function assertEmptyOutput(directory: string): Promise<void> {
  try {
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink() || (await readdir(directory)).length) throw new Error('Mentions output must be a new or truly empty directory; nonempty output is never overwritten.');
  } catch (error) {if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;}
}

/** Holds a sibling exclusive lease from before source reads through the atomic bundle publication. */
export async function withMentionOutput<T>(directory: string, operation: (output: string) => Promise<T>): Promise<T> {
  const output = path.resolve(directory), parent = path.dirname(output);
  await mkdir(parent, {recursive: true});await assertEmptyOutput(output);
  const lock = path.join(parent, `.${path.basename(output)}.ywtc-mentions.lock`);
  const handle = await open(lock, 'wx', 0o600);
  try {await assertEmptyOutput(output);return await operation(output);}
  finally {await handle.close();await rm(lock, {force: true});}
}

export async function writeMentionBundle(directory: string, document: MentionDecisionDocument, shell?: string): Promise<{json: string; html: string; url: string}> {
  await assertEmptyOutput(directory);
  const checked = parseMentionDecisions(document);
  const template = shell ?? await readFile(fileURLToPath(new URL(import.meta.url.includes('/src/') ? '../dist/mentions-ui/index.html' : './mentions-ui/index.html', import.meta.url)), 'utf8');
  const html = embedMentionDocument(template, checked);
  const staging = await mkdtemp(path.join(path.dirname(directory), '.ywtc-mentions-'));
  try {
    await chmod(staging, 0o700);
    await writeFile(path.join(staging, 'decisions.json'), `${JSON.stringify(checked, null, 2)}\n`, {mode: 0o600});
    await writeFile(path.join(staging, 'index.html'), html, {mode: 0o600});
    await assertEmptyOutput(directory);await rename(staging, directory);
  } finally {await rm(staging, {recursive: true, force: true});}
  const htmlPath = path.join(directory, 'index.html');
  return {json: path.join(directory, 'decisions.json'), html: htmlPath, url: pathToFileURL(htmlPath).toString()};
}

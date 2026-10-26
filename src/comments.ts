import {createHash} from 'node:crypto';
import {createReadStream, createWriteStream} from 'node:fs';
import {mkdir, stat} from 'node:fs/promises';
import path from 'node:path';
import {Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {ZipArchive} from '@archiver/archiver';
import {extractPageReferences} from './content-model.js';
import type {
  CommentAttachmentReference,
  CommentAuthor,
  CommentEntry,
  CommentInventory,
  CommentThread,
  DestinationPage,
  ProviderKind,
  RawContentFormat,
  SourcePage,
  SourceResource,
  MentionProcessingPolicy,
} from './domain.js';
import {safeFilename} from './input.js';
import type {HashtagProcessingPolicy} from './hashtag-decisions.js';
import {renderSafeCommentHashtags} from './hashtags.js';
import {renderSafeCommentMentions} from './mentions.js';

export interface FlatComment {
  id: string;
  parentId?: string;
  threadId?: string;
  author: CommentAuthor;
  createdAt?: string;
  body: string;
  inlineContext?: string;
  status?: 'open' | 'resolved' | 'deleted';
}

export interface CommentArchiveFile {
  commentId: string;
  reference: string;
  originalName: string;
  path: string;
  size: number;
  sha256: string;
}

interface CommentArchiveManifestEntry {
  sourceCommentId: string;
  sourceReference: string;
  originalName: string;
  archiveName: string;
  size: number;
  sha256: string;
}

export interface CommentArchiveZip {
  path: string;
  name: string;
  size: number;
  sha256: string;
  files: CommentArchiveManifestEntry[];
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function authorKey(author: CommentAuthor): string {
  return author.providerId || author.username || author.publicName || author.email || author.displayName || 'unknown';
}

function commentAuthorLabel(author: CommentAuthor): string {
  return author.displayName || author.username || author.publicName || author.email || author.providerId || 'Неизвестный автор';
}

function commentAuthorDetail(author: CommentAuthor): string | undefined {
  return author.username || author.publicName || author.email;
}

function extractAttachmentReferences(body: string, format: RawContentFormat): CommentAttachmentReference[] {
  const seen = new Set<string>();
  return extractPageReferences(body, format).flatMap((reference) => {
    if (reference.kind !== 'attachment' || !reference.href) return [];
    const key = `${reference.href}\0${reference.raw}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{raw: reference.raw, href: reference.href, ...(reference.pageTitle ? {label: reference.pageTitle} : {})}];
  });
}

function entryFromFlat(comment: FlatComment, format: RawContentFormat): CommentEntry {
  return {
    id: comment.id,
    ...(comment.parentId ? {parentId: comment.parentId} : {}),
    threadId: comment.threadId || comment.parentId || comment.id,
    author: comment.author,
    ...(comment.createdAt ? {createdAt: comment.createdAt} : {}),
    body: comment.body,
    bodyFormat: format,
    ...(comment.inlineContext ? {inlineContext: comment.inlineContext} : {}),
    ...(comment.status ? {status: comment.status} : {}),
    attachments: extractAttachmentReferences(comment.body, format),
    links: extractPageReferences(comment.body, format),
    replies: [],
  };
}

function orderedParticipants(root: CommentEntry): CommentAuthor[] {
  const result: CommentAuthor[] = [];
  const seen = new Set<string>();
  const visit = (entry: CommentEntry): void => {
    const key = authorKey(entry.author);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(entry.author);
    }
    for (const reply of entry.replies) visit(reply);
  };
  visit(root);
  return result;
}

function canonicalEntry(entry: CommentEntry): unknown {
  return {
    id: entry.id,
    parentId: entry.parentId,
    threadId: entry.threadId,
    author: entry.author,
    createdAt: entry.createdAt,
    body: entry.body,
    inlineContext: entry.inlineContext,
    status: entry.status,
    attachments: entry.attachments.map((item) => ({href: item.href, resourceId: item.resourceId})),
    replies: entry.replies.map(canonicalEntry),
  };
}

function inventoryFingerprint(threads: CommentThread[]): string {
  return hash(JSON.stringify(threads.map((thread) => canonicalEntry(thread.root))));
}

export function normalizeCommentForest(
  comments: FlatComment[],
  format: RawContentFormat,
  warnings: string[] = [],
): CommentInventory {
  const unique = new Map<string, CommentEntry>();
  for (const raw of comments) {
    if (unique.has(raw.id)) {
      warnings.push(`Duplicate comment ${raw.id} was returned and ignored`);
      continue;
    }
    unique.set(raw.id, entryFromFlat(raw, format));
  }
  const roots: CommentEntry[] = [];
  const createsCycle = (entry: CommentEntry, parent: CommentEntry): boolean => {
    const seen = new Set([entry.id]);
    let cursor: CommentEntry | undefined = parent;
    while (cursor) {
      if (seen.has(cursor.id)) return true;
      seen.add(cursor.id);
      cursor = cursor.parentId ? unique.get(cursor.parentId) : undefined;
    }
    return false;
  };
  for (const entry of unique.values()) {
    if (!entry.parentId) {
      roots.push(entry);
      continue;
    }
    const parent = unique.get(entry.parentId);
    if (!parent) {
      warnings.push(`Comment ${entry.id} references missing parent ${entry.parentId}; kept as a top-level orphan`);
      roots.push(entry);
      continue;
    }
    if (createsCycle(entry, parent)) {
      warnings.push(`Comment reply cycle at ${entry.id} → ${parent.id}; edge was broken`);
      roots.push(entry);
      continue;
    }
    parent.replies.push(entry);
  }
  const sortEntries = (entries: CommentEntry[]): void => {
    entries.sort((left, right) => (left.createdAt ?? '').localeCompare(right.createdAt ?? '') || left.id.localeCompare(right.id));
    for (const entry of entries) sortEntries(entry.replies);
  };
  sortEntries(roots);
  const threads = roots.map((root) => ({id: root.threadId || root.id, root, participants: orderedParticipants(root)}));
  const attachments = [...unique.values()].reduce((total, entry) => total + entry.attachments.length, 0);
  const participants = new Set([...unique.values()].map((entry) => authorKey(entry.author))).size;
  return {
    status: threads.length === 0 ? 'empty' : 'complete',
    threads,
    ...(threads.length > 0 ? {fingerprint: inventoryFingerprint(threads)} : {}),
    comments: unique.size,
    participants,
    attachments,
    knownBytes: 0,
    unknownSizes: attachments,
    warnings,
  };
}

function aliasValues(resource: SourceResource): string[] {
  return [resource.name, resource.preferredName, resource.downloadUrl, ...(resource.referenceAliases ?? [])]
    .filter((value): value is string => Boolean(value))
    .flatMap((value) => {
      const aliases = [value];
      try {
        const url = new URL(value);
        aliases.push(decodeURIComponent(url.pathname), decodeURIComponent(url.pathname.split('/').at(-1) ?? ''));
      } catch {
        aliases.push(decodeURIComponent(value.split(/[?#]/, 1)[0]?.split('/').at(-1) ?? value));
      }
      return aliases;
    });
}

export function resolveCommentAttachmentReferences(inventory: CommentInventory, resources: SourceResource[]): void {
  const exact = new Map<string, Set<string>>();
  const byId = new Map(resources.map((resource) => [resource.id, resource]));
  for (const resource of resources.filter((item) => item.kind !== 'grid')) {
    for (const alias of aliasValues(resource)) {
      const key = alias.trim();
      if (!key) continue;
      const ids = exact.get(key) ?? new Set<string>();
      ids.add(resource.id);
      exact.set(key, ids);
    }
  }
  let knownBytes = 0;
  let unknownSizes = 0;
  const counted = new Set<string>();
  const visit = (entry: CommentEntry): void => {
    for (const reference of entry.attachments) {
      const candidates = new Set<string>();
      for (const alias of [reference.href, reference.raw, reference.label].filter((value): value is string => Boolean(value))) {
        for (const id of exact.get(alias) ?? []) candidates.add(id);
        try {
          const url = new URL(alias);
          for (const id of exact.get(decodeURIComponent(url.pathname)) ?? []) candidates.add(id);
          for (const id of exact.get(decodeURIComponent(url.pathname.split('/').at(-1) ?? '')) ?? []) candidates.add(id);
        } catch {
          for (const id of exact.get(decodeURIComponent(alias.split(/[?#]/, 1)[0]?.split('/').at(-1) ?? alias)) ?? []) candidates.add(id);
        }
      }
      if (candidates.size === 1) {
        const resourceId = [...candidates][0]!;
        reference.resourceId = resourceId;
        if (!counted.has(resourceId)) {
          counted.add(resourceId);
          const resource = byId.get(resourceId);
          if (resource?.size !== undefined) knownBytes += resource.size;
          else unknownSizes += 1;
        }
      } else {
        inventory.warnings.push(candidates.size === 0
          ? `Comment attachment reference could not be resolved: ${reference.href}`
          : `Comment attachment reference is ambiguous: ${reference.href}`);
      }
    }
    for (const reply of entry.replies) visit(reply);
  };
  for (const thread of inventory.threads) visit(thread.root);
  inventory.knownBytes = knownBytes;
  inventory.unknownSizes = unknownSizes;
  inventory.attachments = counted.size;
  if (inventory.threads.length > 0) inventory.fingerprint = inventoryFingerprint(inventory.threads);
}

function decodeEntities(value: string): string {
  return value.replace(/&nbsp;/gi, ' ').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&amp;/gi, '&');
}

function readableBody(value: string): string {
  const links = value.replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_all, href: string, label: string) => `[${decodeEntities(label.replace(/<[^>]*>/g, ''))}](${href})`);
  return decodeEntities(links.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<[^>]*>/g, '')).trim();
}

function replaceAttachmentTokens(entry: CommentEntry, replacements: Map<string, string>, source = entry.body): string {
  let body = readableBody(source);
  const tokens = new Map<string, string>();
  for (const [index, reference] of entry.attachments.entries()) {
    if (!reference.resourceId) continue;
    const name = replacements.get(reference.resourceId);
    if (!name) continue;
    const token = `\u0000YWTC_COMMENT_ATTACHMENT_${index}\u0000`;
    body = body.replace(/\[([^\]]*)\]\(([^)]+)\)/g, (whole, _label: string, href: string) => href === reference.href ? token : whole);
    body = body.replaceAll(reference.raw, token).replaceAll(reference.href, token);
    tokens.set(token, `{${name}}`);
  }
  for (const [token, replacement] of tokens) body = body.replaceAll(token, replacement);
  return body;
}

function rewriteInternalUrls(value: string, pages?: Map<string, DestinationPage>, sourcePages?: Map<string, SourcePage>): string {
  if (!pages || !sourcePages) return value;
  let result = value;
  for (const [canonicalId, source] of sourcePages) {
    const destination = pages.get(canonicalId);
    if (destination) result = result.replaceAll(source.url, destination.url);
  }
  return result;
}

function entryLines(entry: CommentEntry, depth: number, replacements: Map<string, string>, context: CommentRenderContext): string[] {
  const indent = '  '.repeat(depth);
  const status = entry.status && entry.status !== 'open' ? ` · ${entry.status}` : '';
  const when = entry.createdAt ? ` · ${entry.createdAt}` : '';
  const header = `${indent}${commentAuthorLabel(entry.author)}${when}${status}:`;
  const contextLines = entry.inlineContext ? [`${indent}> ${renderSafeCommentHashtags(entry.inlineContext, context.hashtagPolicy ?? {mode: 'off'}, entry.bodyFormat, value => renderSafeCommentMentions(value, context.mentionPolicy ?? {mode: 'off'}, entry.bodyFormat, readableBody).content).replaceAll('\n', `\n${indent}> `)}`] : [];
  const body = renderSafeCommentHashtags(entry.body, context.hashtagPolicy ?? {mode: 'off'}, entry.bodyFormat, value => renderSafeCommentMentions(value, context.mentionPolicy ?? {mode: 'off'}, entry.bodyFormat,
    content => rewriteInternalUrls(replaceAttachmentTokens(entry, replacements, content), context.pages, context.sourcePages)).content);
  const lines = body.split('\n').map((line) => `${indent}${line}`);
  return [header, ...contextLines, ...lines, ...entry.replies.flatMap((reply) => ['', ...entryLines(reply, depth + 1, replacements, context)])];
}

function participantsText(thread: CommentThread): string {
  return thread.participants.map((author, index) => {
    const label = commentAuthorLabel(author);
    const detail = commentAuthorDetail(author);
    return `${index + 1}. ${label}${detail && detail !== label ? ` — ${detail}` : ''}`;
  }).join('\n');
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function markdownLinksToHtml(value: string): string {
  // Parse link labels/destinations in one forward pass, including escaped labels and angle URLs.
  const chunks: string[] = [];
  let cursor = 0, index = 0;
  while (index < value.length) {
    if (value[index] !== '[') {index += 1;continue;}
    let end = index + 1, label = '';
    while (end < value.length && value[end] !== ']') {
      if (value[end] === '\\' && end + 1 < value.length) {label += value[end + 1];end += 2;}
      else label += value[end++];
    }
    if (end >= value.length) break;
    if (value[end + 1] !== '(') {index = end + 1;continue;}
    const start = end + 2, angle = value[start] === '<';
    let stop = start + (angle ? 1 : 0), depth = 1;
    while (stop < value.length) {
      if (angle ? value[stop] === '>' : value[stop] === ')' && depth === 1) break;
      if (!angle && value[stop] === '(') depth += 1;
      if (!angle && value[stop] === ')') depth -= 1;
      stop += 1;
    }
    const finish = stop + (angle ? 1 : 0), href = value.slice(start + (angle ? 1 : 0), stop);
    if (stop >= value.length) break;
    if (value[finish] !== ')' || !/^https?:\/\//i.test(href)) {index = finish + 1;continue;}
    chunks.push(escapeHtml(value.slice(cursor, index)), `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`);
    cursor = finish + 1;index = cursor;
  }
  chunks.push(escapeHtml(value.slice(cursor)));
  return chunks.join('').replace(/\n/g, '<br/>');
}

export interface CommentRenderContext {
  sourceUrl: string;
  archiveName?: string;
  archiveHref?: string;
  archiveReplaces?: string;
  attachmentNames?: Map<string, string>;
  pages?: Map<string, DestinationPage>;
  sourcePages?: Map<string, SourcePage>;
  mentionPolicy?: MentionProcessingPolicy;
  hashtagPolicy?: HashtagProcessingPolicy;
  presentation?: 'native' | 'quote' | 'code';
}

function threadText(thread: CommentThread, replacements: Map<string, string>, context: CommentRenderContext): string {
  return `Участники:\n${participantsText(thread)}\n\n${entryLines(thread.root, 0, replacements, context).join('\n')}`;
}

function quoteLines(value: string): string {
  return value.split('\n').map((line) => `> ${line}`).join('\n');
}

function cdata(value: string): string {
  return value.replaceAll(']]>', ']]]]><![CDATA[>');
}

export function renderCommentArchive(
  inventory: CommentInventory,
  target: ProviderKind | 'markdown' | 'html',
  context: CommentRenderContext,
): string {
  const replacements = context.attachmentNames ?? new Map<string, string>();
  const fingerprint = inventory.fingerprint ?? hash('empty');
  const header = `Архив комментариев из [оригинала](${context.sourceUrl}).`;
  const archive = context.archiveName
    ? `\n\nВложения комментариев: [${context.archiveName}](${context.archiveHref ?? context.archiveName})`
    : '';
  const revision = context.archiveReplaces ? `\n\nЭта ревизия заменяет архив ${context.archiveReplaces}.` : '';
  const preamble = `${header}${archive}\n\nВерсия архива: ${fingerprint}${revision}`;
  const threadMarkdown = inventory.threads.map((thread, index) => {
    const content = threadText(thread, replacements, context);
    return `<details>\n<summary>Ветка ${index + 1}</summary>\n\n${content}\n\n</details>`;
  }).join('\n\n');
  if (target === 'markdown') return `${preamble}\n\n${threadMarkdown}`;
  if (target === 'html') {
    const threads = inventory.threads.map((thread, index) => {
      const content = threadText(thread, replacements, context);
      return `<details><summary>Ветка ${index + 1}</summary><div class="ywtc-comment-thread">${markdownLinksToHtml(content)}</div></details>`;
    }).join('');
    return `<section class="ywtc-comments"><h2>Комментарии</h2><p>${markdownLinksToHtml(preamble)}</p>${threads}</section>`;
  }
  if (target === 'yandex-wiki') {
    if (context.presentation === 'code') {
      const threads = inventory.threads.map((thread, index) => `Ветка ${index + 1}\n${threadText(thread, replacements, context)}`).join('\n\n');
      return `${preamble}\n\n\`\`\`text\n${threads}\n\`\`\``;
    }
    if (context.presentation === 'quote') {
      const threads = inventory.threads.map((thread, index) => `Ветка ${index + 1}\n${quoteLines(threadText(thread, replacements, context))}`).join('\n\n');
      return `${preamble}\n\n${threads}`;
    }
    const threads = inventory.threads.map((thread, index) => {
      const content = threadText(thread, replacements, context);
      return `{% cut "Ветка ${index + 1}" %}\n${content}\n{% endcut %}`;
    }).join('\n\n');
    return `${preamble}\n\n${threads}`;
  }
  const confluenceHeader = `<p>Архив комментариев из <a href="${escapeHtml(context.sourceUrl)}">оригинала</a>.</p>`;
  const confluenceArchive = context.archiveName
    ? `<p>Вложения комментариев: <ac:link><ri:attachment ri:filename="${escapeHtml(context.archiveName)}"/><ac:plain-text-link-body><![CDATA[${context.archiveName}]]></ac:plain-text-link-body></ac:link></p>`
    : '';
  const confluenceRevision = context.archiveReplaces ? `<p>Эта ревизия заменяет архив ${escapeHtml(context.archiveReplaces)}.</p>` : '';
  const preambleHtml = `${confluenceHeader}${confluenceArchive}<p>Версия архива: ${escapeHtml(fingerprint)}</p>${confluenceRevision}`;
  if (context.presentation === 'code') {
    const content = inventory.threads.map((thread, index) => `Ветка ${index + 1}\n${threadText(thread, replacements, context)}`).join('\n\n');
    return `${preambleHtml}<ac:structured-macro ac:name="code"><ac:plain-text-body><![CDATA[${cdata(content)}]]></ac:plain-text-body></ac:structured-macro>`;
  }
  if (context.presentation === 'quote') {
    const threads = inventory.threads.map((thread, index) => `<h4>Ветка ${index + 1}</h4><blockquote><p>${markdownLinksToHtml(threadText(thread, replacements, context))}</p></blockquote>`).join('');
    return `${preambleHtml}${threads}`;
  }
  const threads = inventory.threads.map((thread, index) => {
    const content = threadText(thread, replacements, context);
    return `<ac:structured-macro ac:name="expand"><ac:parameter ac:name="title">Ветка ${index + 1}</ac:parameter><ac:rich-text-body><p>${markdownLinksToHtml(content)}</p></ac:rich-text-body></ac:structured-macro>`;
  }).join('');
  return `${preambleHtml}${threads}`;
}

export function renderCommentArchiveIndex(
  inventory: CommentInventory,
  target: ProviderKind,
  context: CommentRenderContext & {fullArchiveName: string; fullArchiveHref?: string},
): string {
  const fingerprint = inventory.fingerprint ?? hash('empty');
  const participants = inventory.threads.flatMap((thread) => thread.participants);
  const uniqueParticipants = [...new Map(participants.map((author) => [authorKey(author), author])).values()];
  const lines = [
    `Архив комментариев из [оригинала](${context.sourceUrl}).`,
    '',
    `Полный архив: [${context.fullArchiveName}](${context.fullArchiveHref ?? context.fullArchiveName})`,
    ...(context.archiveName ? ['', `Вложения комментариев: [${context.archiveName}](${context.archiveHref ?? context.archiveName})`] : []),
    '',
    `Версия архива: ${fingerprint}`,
    '',
    'Участники:',
    ...uniqueParticipants.map((author, index) => `${index + 1}. ${commentAuthorLabel(author)}${commentAuthorDetail(author) && commentAuthorDetail(author) !== commentAuthorLabel(author) ? ` — ${commentAuthorDetail(author)}` : ''}`),
    '',
    'Ветки:',
    ...inventory.threads.map((thread, index) => `${index + 1}. ${commentAuthorLabel(thread.root.author)} · ${thread.root.createdAt ?? 'дата неизвестна'} · ${1 + countReplies(thread.root)} сообщений`),
  ];
  if (target === 'yandex-wiki') return lines.join('\n');
  return markdownLinksToHtml(lines.join('\n'));
}

function countReplies(entry: CommentEntry): number {
  return entry.replies.reduce((total, reply) => total + 1 + countReplies(reply), 0);
}

export function verifyCommentArchive(expected: string | CommentInventory, body: string, archiveName?: string, mentionPolicy: MentionProcessingPolicy = {mode: 'off'}, hashtagPolicy: HashtagProcessingPolicy = {mode: 'off'}): {ok: boolean; differences: string[]} {
  const differences: string[] = [];
  const expectedFingerprint = typeof expected === 'string' ? expected : expected.fingerprint;
  const readable = readableBody(body);
  if (!expectedFingerprint || !readable.includes(expectedFingerprint)) differences.push('archive fingerprint is missing');
  if (archiveName && !body.includes(archiveName)) differences.push('comment attachment archive reference is missing');
  if (!readable.includes('Архив комментариев из')) differences.push('archive source header is missing');
  if (typeof expected !== 'string') {
    const visit = (entry: CommentEntry): void => {
      const author = commentAuthorLabel(entry.author);
      if (!readable.includes(author)) differences.push(`comment author is missing: ${author}`);
      if (entry.createdAt && !readable.includes(entry.createdAt)) differences.push(`comment date is missing: ${entry.id}`);
      if (entry.status && entry.status !== 'open' && !readable.includes(entry.status)) differences.push(`comment status is missing: ${entry.id}`);
      const text = readableBody(renderSafeCommentHashtags(entry.body, hashtagPolicy, entry.bodyFormat, value => renderSafeCommentMentions(value, mentionPolicy, entry.bodyFormat).content)).replace(/\[[^\]]*\]\([^)]*\)/g, ' ');
      const tokens = text.toLocaleLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? [];
      const actual = readable.toLocaleLowerCase();
      if (tokens.some((token) => !actual.includes(token))) differences.push(`comment text is missing: ${entry.id}`);
      for (const reply of entry.replies) visit(reply);
    };
    for (const thread of expected.threads) visit(thread.root);
  }
  return {ok: differences.length === 0, differences};
}

function uniqueArchiveNames(files: CommentArchiveFile[]): Map<string, string> {
  const result = new Map<string, string>();
  const hashes = [...new Set(files.map((file) => file.sha256))].sort();
  for (const digest of hashes) {
    const matching = files.find((file) => file.sha256 === digest)!;
    let length = 12;
    while (hashes.some((other) => other !== digest && other.slice(0, length) === digest.slice(0, length))) length += 1;
    result.set(digest, `${digest.slice(0, length)}-${safeFilename(matching.originalName)}`);
  }
  return result;
}

async function fileHash(filename: string): Promise<{size: number; sha256: string}> {
  const digest = createHash('sha256');
  let size = 0;
  const meter = new Transform({transform(chunk: Buffer, _encoding, callback) {
    digest.update(chunk);
    size += chunk.length;
    callback(null, chunk);
  }});
  await pipeline(createReadStream(filename), meter, new Transform({transform(_chunk, _encoding, callback) { callback(); }}));
  return {size, sha256: digest.digest('hex')};
}

export async function createCommentArchiveZip(input: {
  pageKey: string;
  fingerprint: string;
  files: CommentArchiveFile[];
  destinationDirectory: string;
}): Promise<CommentArchiveZip | undefined> {
  if (input.files.length === 0) return undefined;
  for (const file of input.files) {
    const actual = await fileHash(file.path);
    if (actual.size !== file.size || actual.sha256 !== file.sha256) {
      throw new Error(`Comment attachment integrity check failed for ${file.originalName}`);
    }
  }
  const names = uniqueArchiveNames(input.files);
  const unique = new Map<string, CommentArchiveFile>();
  for (const file of input.files) if (!unique.has(file.sha256)) unique.set(file.sha256, file);
  const entries: CommentArchiveManifestEntry[] = input.files.map((file) => ({
    sourceCommentId: file.commentId,
    sourceReference: file.reference,
    originalName: file.originalName,
    archiveName: names.get(file.sha256)!,
    size: file.size,
    sha256: file.sha256,
  })).sort((left, right) => left.sourceCommentId.localeCompare(right.sourceCommentId) || left.sourceReference.localeCompare(right.sourceReference));
  const pageKey = safeFilename(input.pageKey).slice(0, 80) || 'page';
  const name = `ywtc-comments-${pageKey}-${input.fingerprint.slice(0, 12)}.zip`;
  const destination = path.join(input.destinationDirectory, name);
  await mkdir(input.destinationDirectory, {recursive: true, mode: 0o700});
  const archive = new ZipArchive({zlib: {level: 9}, forceUTC: true});
  const fixedDate = new Date('1980-01-01T00:00:00.000Z');
  const output = createWriteStream(destination, {mode: 0o600});
  const writing = pipeline(archive, output);
  for (const [digest, file] of [...unique].sort(([left], [right]) => left.localeCompare(right))) {
    archive.file(file.path, {name: names.get(digest)!, date: fixedDate, mode: 0o600});
  }
  archive.append(`${JSON.stringify({files: entries}, null, 2)}\n`, {name: 'manifest.json', date: fixedDate, mode: 0o600});
  await archive.finalize();
  await writing;
  const verified = await fileHash(destination);
  const filesystemSize = (await stat(destination)).size;
  if (filesystemSize !== verified.size) throw new Error(`Comment archive size verification failed for ${name}`);
  return {path: destination, name, size: verified.size, sha256: verified.sha256, files: entries};
}

export function commentAttachmentUses(inventory: CommentInventory): Array<{commentId: string; reference: CommentAttachmentReference}> {
  const result: Array<{commentId: string; reference: CommentAttachmentReference}> = [];
  const visit = (entry: CommentEntry): void => {
    result.push(...entry.attachments.map((reference) => ({commentId: entry.id, reference})));
    for (const reply of entry.replies) visit(reply);
  };
  for (const thread of inventory.threads) visit(thread.root);
  return result;
}

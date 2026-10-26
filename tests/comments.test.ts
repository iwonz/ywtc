import {createHash} from 'node:crypto';
import {mkdir, mkdtemp, readFile, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {
  commentAttachmentUses,
  createCommentArchiveZip,
  normalizeCommentForest,
  renderCommentArchive,
  renderCommentArchiveIndex,
  resolveCommentAttachmentReferences,
  verifyCommentArchive,
} from '../src/comments.js';
import type {SourceResource} from '../src/domain.js';

describe('comment archives', () => {
  it('normalizes nested threads, identities, deleted entries, duplicates, orphans, and cycles deterministically', () => {
    const inventory = normalizeCommentForest([
      {id: '1', threadId: 't', author: {providerId: 'u1', displayName: 'Иван'}, createdAt: '2026-01-01', body: 'Root [spec](files/spec.pdf)', status: 'resolved'},
      {id: '2', parentId: '1', threadId: 't', author: {providerId: 'u2', username: 'anna'}, createdAt: '2026-01-02', body: 'Reply'},
      {id: '2', parentId: '1', author: {providerId: 'u2'}, body: 'duplicate'},
      {id: '3', parentId: 'missing', author: {providerId: 'u3', email: 'user@example.com'}, body: '[Комментарий удалён]', status: 'deleted'},
      {id: '4', parentId: '5', author: {providerId: 'u4'}, body: 'cycle-a'},
      {id: '5', parentId: '4', author: {providerId: 'u5'}, body: 'cycle-b'},
    ], 'yfm');
    expect(inventory.status).toBe('complete');
    expect(inventory.comments).toBe(5);
    expect(inventory.threads).toHaveLength(4);
    const main = inventory.threads.find((thread) => thread.root.id === '1');
    expect(main?.root.replies[0]?.id).toBe('2');
    expect(main?.participants.map((author) => author.providerId)).toEqual(['u1', 'u2']);
    expect(inventory.warnings.join('\n')).toMatch(/Duplicate comment 2|missing parent|cycle/);
    expect(inventory.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it('resolves only exact attachment links and renders all destination forms with attribution and hierarchy', () => {
    const inventory = normalizeCommentForest([
      {id: '1', author: {providerId: 'u1', displayName: 'Иван', username: 'ivan'}, body: 'See [spec](files/spec.pdf), not plain.txt', inlineContext: 'Selected text'},
      {id: '2', parentId: '1', author: {providerId: 'u2', email: 'anna@example.com'}, body: 'Answer'},
    ], 'yfm');
    const resources: SourceResource[] = [{
      provider: 'yandex-wiki', id: 'r1', pageId: 'p1', name: 'spec.pdf', preferredName: 'spec.pdf',
      referenceAliases: ['files/spec.pdf'], size: 42, kind: 'attachment',
    }];
    resolveCommentAttachmentReferences(inventory, resources);
    expect(commentAttachmentUses(inventory)).toMatchObject([{commentId: '1', reference: {resourceId: 'r1'}}]);
    expect(inventory.attachments).toBe(1);
    expect(inventory.knownBytes).toBe(42);
    for (const target of ['confluence', 'yandex-wiki', 'markdown', 'html'] as const) {
      const body = renderCommentArchive(inventory, target, {
        sourceUrl: 'https://wiki.example.com/page',
        archiveName: 'comments.zip',
        attachmentNames: new Map([['r1', 'abcdef123456-spec.pdf']]),
      });
      expect(body).toContain('Архив комментариев');
      expect(body).toContain('Иван');
      expect(body).toContain('anna@example.com');
      expect(body).toContain('abcdef123456-spec.pdf');
      expect(verifyCommentArchive(inventory, body, 'comments.zip')).toEqual({ok: true, differences: []});
    }
    expect(renderCommentArchive(inventory, 'confluence', {sourceUrl: 'https://wiki.example.com/page', presentation: 'quote'})).toContain('<blockquote>');
    expect(renderCommentArchive(inventory, 'confluence', {sourceUrl: 'https://wiki.example.com/page', presentation: 'code'})).toContain('ac:name="code"');
    expect(renderCommentArchive(inventory, 'yandex-wiki', {sourceUrl: 'https://wiki.example.com/page', presentation: 'quote'})).toContain('> Участники:');
    expect(renderCommentArchive(inventory, 'yandex-wiki', {sourceUrl: 'https://wiki.example.com/page', presentation: 'code'})).toContain('```text');
    expect(renderCommentArchiveIndex(inventory, 'confluence', {
      sourceUrl: 'https://wiki.example.com/page', fullArchiveName: 'comments.md', archiveName: 'comments.zip',
    })).toContain('comments.md');
    expect(verifyCommentArchive(inventory, `Архив комментариев из ${inventory.fingerprint}`)).toMatchObject({ok: false});
  });

  it('creates a deterministic streamed ZIP with deduplicated bytes and hash-prefixed safe names', async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), 'ywtc-comments-'));
    const first = path.join(temporary, 'one', 'same.txt');
    const second = path.join(temporary, 'two', '../other.txt');
    await mkdir(path.dirname(first), {recursive: true});
    await writeFile(first, 'same bytes');
    await mkdir(path.dirname(second), {recursive: true});
    await writeFile(second, 'same bytes');
    const digest = createHash('sha256').update('same bytes').digest('hex');
    const files = [
      {commentId: '1', reference: 'same.txt', originalName: 'same.txt', path: first, size: 10, sha256: digest},
      {commentId: '2', reference: '../other.txt', originalName: '../other.txt', path: second, size: 10, sha256: digest},
    ];
    const left = await createCommentArchiveZip({pageKey: '../page', fingerprint: 'a'.repeat(64), files, destinationDirectory: path.join(temporary, 'left')});
    const right = await createCommentArchiveZip({pageKey: '../page', fingerprint: 'a'.repeat(64), files, destinationDirectory: path.join(temporary, 'right')});
    expect(left?.files).toHaveLength(2);
    expect(new Set(left?.files.map((entry) => entry.archiveName)).size).toBe(1);
    expect(left?.files[0]?.archiveName).toMatch(new RegExp(`^${digest.slice(0, 12)}-`));
    expect(path.basename(left!.path)).toBe('ywtc-comments-page-aaaaaaaaaaaa.zip');
    expect(await readFile(left!.path)).toEqual(await readFile(right!.path));
    expect(left?.sha256).toBe(right?.sha256);
    await expect(createCommentArchiveZip({
      pageKey: 'page', fingerprint: 'b'.repeat(64),
      files: [{...files[0]!, sha256: '0'.repeat(64)}],
      destinationDirectory: path.join(temporary, 'invalid'),
    })).rejects.toThrow(/integrity check failed/);
  });

  it('renders explicit comment links without native destination markers', () => {
    const yandex = normalizeCommentForest([
      {id: '1', author: {providerId: 'u1'}, body: 'Ping @ivan and `@code`'},
    ], 'yfm');
    const yandexBody = renderCommentArchive(yandex, 'confluence', {
      sourceUrl: 'https://wiki.example.com/page',
      mentionPolicy: {mode: 'mapping', document: {source: {provider: 'yandex-wiki', instance: 'https://wiki.example.com'}, entries: [{identity: {username: 'ivan'}, mention: '@ivan', decision: 'url', url: 'https://people.example/ivan'}]}},
    });
    expect(yandexBody).toContain('https://people.example/ivan');
    expect(yandexBody).toContain('@code');
    expect(yandexBody).not.toContain('ri:user');

    const confluence = normalizeCommentForest([
      {id: '2', author: {providerId: 'u2'}, body: '<p>Hello <ac:link><ri:user ri:username="maria"/><ac:plain-text-link-body>Maria</ac:plain-text-link-body></ac:link></p>'},
    ], 'confluence-storage');
    const confluenceBody = renderCommentArchive(confluence, 'yandex-wiki', {
      sourceUrl: 'https://confluence.example/pages/1',
      mentionPolicy: {mode: 'mapping', document: {source: {provider: 'confluence', instance: 'https://confluence.example'}, entries: [{identity: {username: 'maria'}, mention: 'Maria', decision: 'url', url: 'https://people.example/maria', text: 'Maria'}]}},
    });
    expect(confluenceBody).toContain('[Maria](https://people.example/maria)');
    expect(confluenceBody).not.toContain('ri:user');
  });
  it('preserves literal mapping labels and URL parentheses without page-link rewriting', () => {
    const inventory = normalizeCommentForest([{id: '1', author: {providerId: 'u'}, body: 'Hello @ivan'}], 'yfm');
    const url = 'https://people.example/ivan_(profile)';
    const body = renderCommentArchive(inventory, 'confluence', {sourceUrl: 'https://wiki.example/page',
      mentionPolicy: {mode: 'mapping', document: {source: {provider: 'yandex-wiki', instance: 'https://wiki.example'}, entries: [{identity: {username: 'ivan'}, mention: '@ivan', decision: 'url', url, text: '[Ivan] <admin>'}]}},
    });
    expect(body).toContain(`href="${url}"`);expect(body).toContain('[Ivan] &lt;admin&gt;</a>');
  });
});

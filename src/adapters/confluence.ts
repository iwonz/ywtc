import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import type {ConfluenceConnectionProfile} from '../config.js';
import {extractPageReferences} from '../content-model.js';
import {normalizeCommentForest} from '../comments.js';
import {DestinationTitleConflictError} from '../domain.js';
import type {
  AdapterCapabilities,
  CommentAuthor,
  CommentInventory,
  DestinationAdapter,
  DestinationComment,
  DestinationContainer,
  DestinationPage,
  PageReference,
  SourceAdapter,
  SourceStatus,
  SourcePage,
  SourceResource,
  UploadedResource,
} from '../domain.js';
import {HttpRequestError} from '../http.js';
import type {ConfluenceApi, ConfluenceAttachment, ConfluenceComment, ConfluencePage} from '../types.js';

const capabilities: AdapterCapabilities = {
  readPages: true,
  readHierarchy: true,
  readResources: true,
  writePages: true,
  writeResources: true,
  verifyWrites: true,
  reparentPages: true,
  readComments: true,
  writeComments: true,
  updateComments: true,
};

function canonical(profile: ConfluenceConnectionProfile, id: string): string {
  return `${profile.name}:confluence:${id}`;
}

function fingerprint(page: ConfluencePage): string {
  return createHash('sha256').update(`${page.title}\0${page.body?.storage?.value ?? ''}\0${page.version?.number ?? ''}`).digest('hex');
}

function contentFingerprint(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

const duplicateTitlePattern = /(?:duplicate\s+(?:page\s+)?title|page\s+with\s+(?:the\s+)?(?:same|this)\s+title|title[^.]{0,80}(?:already\s+exists|must\s+be\s+unique)|cannot\s+(?:add|create)[^.]{0,80}(?:same|existing)[^.]{0,40}(?:title|name))/i;

function possibleTitleConflict(error: unknown): error is HttpRequestError {
  return error instanceof HttpRequestError
    && (error.status === 400 || error.status === 409);
}

function sourcePage(profile: ConfluenceConnectionProfile, client: ConfluenceApi, page: ConfluencePage): SourcePage {
  const rawContent = page.body?.storage?.value;
  if (rawContent === undefined) throw new Error(`Confluence page response for ${page.id} is missing body.storage.value`);
  return {
    provider: 'confluence',
    profile: profile.name,
    id: page.id,
    canonicalId: canonical(profile, page.id),
    title: page.title,
    locator: page.id,
    url: client.pageWebUrl(page),
    ...(page.ancestors?.at(-1)?.id ? {parentId: page.ancestors.at(-1)!.id} : {}),
    ...(page.ancestors?.length ? {ancestorIds: page.ancestors.map((ancestor) => ancestor.id)} : {}),
    ...(page.status ? {sourceStatus: page.status === 'current' ? 'current' as const : 'non-current' as const} : {}),
    space: page.space.key,
    rawContent,
    rawFormat: 'confluence-storage',
    ...(page.version?.number ? {version: String(page.version.number)} : {}),
    references: extractPageReferences(rawContent, 'confluence-storage'),
  };
}

function destinationPage(profile: ConfluenceConnectionProfile, client: ConfluenceApi, page: ConfluencePage): DestinationPage {
  const content = page.body?.storage?.value ?? '';
  return {
    provider: 'confluence',
    profile: profile.name,
    id: page.id,
    canonicalId: canonical(profile, page.id),
    title: page.title,
    url: client.pageWebUrl(page),
    locator: page.id,
    space: page.space.key,
    ...(page.ancestors?.at(-1)?.id ? {parentId: page.ancestors.at(-1)!.id} : {}),
    ...(page.version?.number ? {version: String(page.version.number)} : {}),
    fingerprint: fingerprint(page),
    content,
    contentFingerprint: contentFingerprint(content),
    contentLength: Buffer.byteLength(content),
  };
}

function commentAuthor(value: ConfluenceComment['author']): CommentAuthor {
  return {
    providerId: value?.accountId ?? value?.userKey ?? value?.username ?? value?.email ?? 'unknown',
    ...(value?.displayName ? {displayName: value.displayName} : {}),
    ...(value?.username ? {username: value.username} : {}),
    ...(value?.publicName ? {publicName: value.publicName} : {}),
    ...(value?.email ? {email: value.email} : {}),
  };
}

function destinationComment(pageId: string, comment: ConfluenceComment): DestinationComment {
  const body = comment.body?.storage?.value ?? '';
  return {
    id: comment.id,
    pageId,
    body,
    ...(comment.version?.number ? {version: String(comment.version.number)} : {}),
    fingerprint: contentFingerprint(body),
  };
}

export class ConfluenceAdapter implements SourceAdapter, DestinationAdapter {
  readonly kind = 'confluence' as const;
  readonly capabilities = capabilities;

  constructor(public readonly profile: ConfluenceConnectionProfile, private readonly client: ConfluenceApi) {}

  async preflight(): Promise<{product: string; version?: string; warnings: string[]}> {
    const info = await this.client.preflight?.();
    return {product: info?.product ?? 'Confluence', ...(info?.version ? {version: info.version} : {}), warnings: []};
  }

  async resolvePage(locator: string): Promise<SourcePage> {
    return sourcePage(this.profile, this.client, await this.client.resolveTarget(locator));
  }

  async getPage(id: string): Promise<SourcePage> {
    return sourcePage(this.profile, this.client, await this.client.getPage(id));
  }

  supportsSourceStatus(_scope: import('../domain.js').TransferScope, _status: SourceStatus): boolean {
    return true;
  }

  async getDescendants(page: SourcePage, options: {status: SourceStatus}) {
    const descendants = await this.client.getDescendants(page.id);
    const hydrated = await Promise.all(descendants.map(async (item) => sourcePage(
      this.profile,
      this.client,
      item.body?.storage?.value === undefined ? await this.client.getPage(item.id) : item,
    )));
    if (options.status === 'current') {
      const unknown = hydrated.filter((item) => item.sourceStatus === undefined);
      if (unknown.length > 0) {
        throw new Error(`Confluence hierarchy did not expose status for ${unknown.length} descendant page(s); --source-status current cannot be determined reliably`);
      }
    }
    const pages = options.status === 'current'
      ? hydrated.filter((item) => item.sourceStatus === 'current')
      : hydrated;
    return {
      pages,
      returned: hydrated.length,
      excluded: options.status === 'current'
        ? hydrated.filter((item) => item.sourceStatus !== 'current').map((item) => {
          const rootIndex = item.ancestorIds?.indexOf(page.id) ?? -1;
          return {
            id: item.id,
            canonicalId: item.canonicalId,
            locator: item.locator,
            title: item.title,
            url: item.url,
            ...(item.parentId ? {parentId: item.parentId} : {}),
            ...(item.ancestorIds?.length ? {ancestorIds: item.ancestorIds} : {}),
            ...(rootIndex >= 0 ? {depth: item.ancestorIds!.length - rootIndex} : {}),
            reason: 'source-status' as const,
            status: 'non-current',
            metadataComplete: true,
          };
        })
        : [],
      effectiveStatus: options.status,
      notes: options.status === 'all'
        ? ['Confluence hierarchy APIs expose accessible structural pages; archived, trashed, and historical versions may be absent.']
        : [],
    };
  }

  async resolveReference(from: SourcePage, reference: PageReference): Promise<SourcePage | undefined> {
    if (reference.kind !== 'page') return undefined;
    const href = reference.href ?? '';
    if (href.startsWith('confluence-page:')) return this.getPage(href.slice('confluence-page:'.length));
    if (href.startsWith('page:')) {
      const value = href.slice('page:'.length);
      if (/^\d+$/.test(value)) return this.getPage(value);
      const found = await this.client.findPageByTitle(from.space ?? '', value);
      return found ? sourcePage(this.profile, this.client, await this.client.getPage(found.id)) : undefined;
    }
    if (reference.pageTitle) {
      const referencedSpace = reference.href?.includes(':') ? reference.href.split(':', 1)[0] : undefined;
      const found = await this.client.findPageByTitle(referencedSpace || from.space || '', reference.pageTitle);
      return found ? sourcePage(this.profile, this.client, await this.client.getPage(found.id)) : undefined;
    }
    if (/^(?:https?:\/\/|\/)|viewpage\.action|\/(?:pages|spaces)\//i.test(href)) {
      const url = new URL(href, `${this.profile.baseUrl}/`);
      if (url.origin !== new URL(this.profile.baseUrl).origin) return undefined;
      return sourcePage(this.profile, this.client, await this.client.resolveTarget(url.toString()));
    }
    const [space, title] = href.includes(':') ? href.split(':', 2) : [from.space ?? '', href];
    if (!title) return undefined;
    const found = await this.client.findPageByTitle(space ?? '', title);
    return found ? sourcePage(this.profile, this.client, await this.client.getPage(found.id)) : undefined;
  }

  async listResources(page: SourcePage): Promise<SourceResource[]> {
    return (await this.client.listAttachments(page.id)).map((attachment) => ({
      provider: 'confluence' as const,
      id: attachment.id,
      pageId: page.id,
      name: attachment.title,
      preferredName: attachment.title,
      referenceAliases: [attachment.title, `attachment:${attachment.title}`, attachment._links?.download]
        .filter((value): value is string => Boolean(value)),
      ...(attachment.extensions?.fileSize !== undefined ? {size: attachment.extensions.fileSize} : {}),
      ...(attachment.metadata?.mediaType ? {mimeType: attachment.metadata.mediaType} : {}),
      ...(attachment._links?.download ? {downloadUrl: attachment._links.download} : {}),
      kind: attachment.metadata?.mediaType?.startsWith('image/') ? 'image' as const : 'attachment' as const,
      metadata: {attachment},
    }));
  }

  async readComments(page: SourcePage): Promise<CommentInventory> {
    const comments = await this.client.getPageComments(page.id);
    return normalizeCommentForest(comments.map((comment) => ({
      id: comment.id,
      ...(comment.parentCommentId ? {parentId: comment.parentCommentId} : {}),
      ...(comment.threadId ? {threadId: comment.threadId} : {}),
      author: commentAuthor(comment.author),
      ...(comment.createdAt ? {createdAt: comment.createdAt} : {}),
      body: comment.body?.storage?.value ?? (/deleted/i.test(comment.status ?? '') ? '[Комментарий удалён]' : ''),
      ...(comment.inlineContext ? {inlineContext: comment.inlineContext} : {}),
      status: /deleted/i.test(comment.status ?? '')
        ? 'deleted'
        : /resolved/i.test(comment.resolutionStatus ?? '') ? 'resolved' : 'open',
    })), 'confluence-storage');
  }

  downloadResource(resource: SourceResource, destination: string) {
    return this.client.downloadAttachment(resource.pageId, resource.metadata?.attachment as ConfluenceAttachment, destination);
  }

  async resolveContainer(locator: string): Promise<DestinationContainer> {
    const page = await this.client.resolveTarget(locator);
    return {
      provider: 'confluence', profile: this.profile.name, id: page.id, canonicalId: canonical(this.profile, page.id),
      title: page.title, url: this.client.pageWebUrl(page), space: page.space.key, locator: page.id,
    };
  }

  async findChild(container: DestinationContainer | DestinationPage, title: string): Promise<DestinationPage | undefined> {
    const found = this.client.findChildPage
      ? await this.client.findChildPage(container.id, title)
      : container.space
        ? await this.client.findPageByTitle(container.space, title)
        : undefined;
    if (!found) return undefined;
    const page = destinationPage(this.profile, this.client, await this.client.getPage(found.id));
    return page.parentId === container.id ? page : undefined;
  }

  async findTitleConflict(container: DestinationContainer | DestinationPage, title: string): Promise<DestinationPage | undefined> {
    if (!container.space) return this.findChild(container, title);
    const found = await this.client.findPageByTitle(container.space, title);
    return found ? destinationPage(this.profile, this.client, await this.client.getPage(found.id)) : undefined;
  }

  async findRecoverablePage(container: DestinationContainer | DestinationPage, title: string): Promise<DestinationPage | undefined> {
    return this.findChild(container, title);
  }

  async createPage(input: {container: DestinationContainer | DestinationPage; title: string; body: string}): Promise<DestinationPage> {
    const space = input.container.space;
    if (!space) throw new Error(`Confluence destination ${input.container.id} is missing a space key`);
    try {
      return destinationPage(this.profile, this.client, await this.client.createPage({
        spaceKey: space, parentId: input.container.id, title: input.title, storage: input.body,
      }));
    } catch (error) {
      if (!possibleTitleConflict(error)) throw error;
      let confirmed = duplicateTitlePattern.test(error.message);
      if (!confirmed) {
        try {
          confirmed = Boolean(await this.findTitleConflict(input.container, input.title));
        } catch {
          // Preserve the original bad request when lookup cannot confirm a collision.
        }
      }
      if (!confirmed) throw error;
      throw new DestinationTitleConflictError(input.title, error.status!, {cause: error});
    }
  }

  async updatePage(input: {page: DestinationPage; title: string; body: string; expectedFingerprint?: string}): Promise<DestinationPage> {
    if (input.expectedFingerprint) {
      const current = destinationPage(this.profile, this.client, await this.client.getPage(input.page.id));
      if (current.fingerprint !== input.expectedFingerprint) throw new Error(`Destination conflict for Confluence page ${input.page.id}: content changed since the last verified run`);
    }
    return destinationPage(this.profile, this.client, await this.client.updatePage({pageId: input.page.id, title: input.title, storage: input.body}));
  }

  async reparentPage(input: {
    page: DestinationPage;
    parent: DestinationContainer | DestinationPage;
    expectedFingerprint?: string;
  }): Promise<DestinationPage> {
    if (input.expectedFingerprint) {
      const current = destinationPage(this.profile, this.client, await this.client.getPage(input.page.id));
      if (current.fingerprint !== input.expectedFingerprint) {
        throw new Error(`Destination conflict for Confluence page ${input.page.id}: content changed since the last verified run`);
      }
      input.page = current;
    }
    const moved = destinationPage(this.profile, this.client, await this.client.updatePage({
      pageId: input.page.id,
      title: input.page.title,
      storage: input.page.content ?? '',
      parentId: input.parent.id,
    }));
    const verified = destinationPage(this.profile, this.client, await this.client.getPage(moved.id));
    if (verified.parentId !== input.parent.id) {
      throw new Error(`Confluence hierarchy verification failed for page ${input.page.id}: expected parent ${input.parent.id}, received ${verified.parentId ?? 'none'}`);
    }
    return verified;
  }

  async uploadResource(input: {page: DestinationPage; name: string; filePath: string; size?: number; mimeType?: string; existingId?: string}): Promise<UploadedResource> {
    const uploaded = await this.client.uploadAttachment({
      pageId: input.page.id,
      filename: input.name,
      file: createReadStream(input.filePath),
      ...(input.size !== undefined ? {contentLength: input.size} : {}),
      ...(input.mimeType ? {mimeType: input.mimeType} : {}),
      ...(input.existingId ? {existingAttachmentId: input.existingId} : {}),
    });
    return {
      id: uploaded.id,
      name: uploaded.title,
      ...(uploaded.extensions?.fileSize !== undefined ? {size: uploaded.extensions.fileSize} : {}),
      ...(uploaded._links?.download ? {url: uploaded._links.download} : {}),
    };
  }

  async listUploadedResources(page: DestinationPage): Promise<UploadedResource[]> {
    return (await this.client.listAttachments(page.id)).map((attachment) => ({
      id: attachment.id,
      name: attachment.title,
      ...(attachment.extensions?.fileSize !== undefined ? {size: attachment.extensions.fileSize} : {}),
      ...(attachment._links?.download ? {url: attachment._links.download} : {}),
    }));
  }

  async downloadUploadedResource(input: {page: DestinationPage; resource: UploadedResource; destination: string}) {
    return this.client.downloadAttachment(input.page.id, {
      id: input.resource.id,
      title: input.resource.name,
      ...(input.resource.size !== undefined ? {extensions: {fileSize: input.resource.size}} : {}),
      ...(input.resource.url ? {_links: {download: input.resource.url}} : {}),
    }, input.destination);
  }

  async verifyPage(page: DestinationPage): Promise<DestinationPage> {
    return destinationPage(this.profile, this.client, await this.client.getPage(page.id));
  }

  renderPageReference(page: DestinationPage, label: string, anchor?: string): string {
    return `<ac:link${anchor ? ` ac:anchor="${anchor}"` : ''}><ri:page ri:content-title="${page.title}"/><ac:link-body>${label}</ac:link-body></ac:link>`;
  }

  renderResourceReference(resource: UploadedResource, label: string, image: boolean): string {
    return image
      ? `<ac:image ac:alt="${label}"><ri:attachment ri:filename="${resource.name}"/></ac:image>`
      : `<ac:link><ri:attachment ri:filename="${resource.name}"/><ac:plain-text-link-body><![CDATA[${label}]]></ac:plain-text-link-body></ac:link>`;
  }

  async findArchiveComment(page: DestinationPage, fingerprint?: string): Promise<DestinationComment | undefined> {
    const comments = await this.client.getPageComments(page.id);
    const matches = comments.filter((comment) => (comment.body?.storage?.value ?? '').includes('Архив комментариев из'));
    const match = fingerprint
      ? matches.find((comment) => (comment.body?.storage?.value ?? '').includes(fingerprint))
      : matches.at(-1);
    return match ? destinationComment(page.id, match) : undefined;
  }

  async createArchiveComment(input: {page: DestinationPage; body: string}): Promise<DestinationComment> {
    return destinationComment(input.page.id, await this.client.createComment({pageId: input.page.id, storage: input.body}));
  }

  async updateArchiveComment(input: {comment: DestinationComment; body: string}): Promise<DestinationComment> {
    return destinationComment(input.comment.pageId, await this.client.updateComment({
      commentId: input.comment.id,
      storage: input.body,
      ...(input.comment.version ? {version: Number(input.comment.version)} : {}),
    }));
  }

  async readArchiveComment(input: {page: DestinationPage; commentId: string}): Promise<DestinationComment> {
    return destinationComment(input.page.id, await this.client.getComment(input.commentId));
  }
}

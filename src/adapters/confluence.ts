import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import type {ConfluenceConnectionProfile} from '../config.js';
import {extractPageReferences} from '../content-model.js';
import {normalizeCommentForest} from '../comments.js';
import {diagramKindForFilename} from '../diagrams.js';
import {DestinationResourceSizeLimitError, DestinationRevisionConflictError, DestinationTitleConflictError, IncompleteSourceDiscoveryError} from '../domain.js';
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
import {sourceInventoryOperationError} from '../source-inventory.js';
import {confluenceSpaceKey} from '../source-roots.js';
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
  return createHash('sha256').update(`${page.title}\0${page.body?.storage?.value ?? ''}`).digest('hex');
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
  async resolveNativePageReference(reference:{id?:string;title:string;space?:string},context:DestinationPage):Promise<{id:string;title:string;space:string}|undefined> {
    const space=reference.space??context.space;if(!space)return undefined;
    const byTitle=await this.client.findPageByTitle(space,reference.title);if(!byTitle)return undefined;
    const target=reference.id?await this.client.getPage(reference.id):byTitle;
    if(target.id!==byTitle.id||target.title!==reference.title)return undefined;
    return {id:target.id,title:target.title,space:String(target.space.id??target.space.key)};
  }
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

  async resolveRoot(locator: string): Promise<import('../domain.js').SourceRoot> {
    const key = confluenceSpaceKey(locator, this.profile.baseUrl);
    if (key === undefined) return {kind: 'page', item: await this.resolvePage(locator)};
    if (!this.client.getSpace) throw new Error('Confluence source does not support space resolution');
    const space = await this.client.getSpace(key);
    const base = this.profile.baseUrl.replace(/\/$/, '');
    const url = this.profile.deployment === 'cloud'
      ? `${base.replace(/\/wiki$/, '')}/wiki/spaces/${encodeURIComponent(space.key)}/overview`
      : `${base}/display/${encodeURIComponent(space.key)}`;
    return {kind: 'space', item: {provider: 'confluence', profile: this.profile.name, id: `space:${space.id}`, canonicalId: `${this.profile.name}:confluence:space:${space.id}`, title: space.name, locator, url, space: space.id, rawContent: '', rawFormat: 'confluence-storage', references: [], sourceSpace: space}};
  }

  async getSpacePages(space: import('../types.js').ConfluenceSpace, checkpoint?: import('../domain.js').SourcePageCheckpoint, signal?: AbortSignal): Promise<SourcePage[]> {
    if (!this.client.getSpacePages) throw new Error('Confluence source does not support space page enumeration');
    const pages = await this.client.getSpacePages(space, signal);
    const result: SourcePage[] = [];
    const failures: import('../domain.js').SourceDiscoveryFailure[] = [];
    for (const item of pages) {
      if (signal?.aborted) throw signal.reason ?? new Error('Space discovery cancelled');
      let operation: 'page-detail' | 'checkpoint-write' = 'page-detail';
      try {
        const cached = await checkpoint?.loadPage(item.id, item.id);
        const reusable = cached && item.version && cached.version === String(item.version.number) ? cached : undefined;
        const full = sourcePage(this.profile, this.client, item.body?.storage?.value !== undefined ? item : reusable ? {...item, body: {storage: {value: reusable.rawContent, representation: 'storage'}}} : await this.client.getPage(item.id));
        if (full.space !== space.key && full.space !== space.id) throw new Error(`Source page ${item.id} no longer belongs to the selected space`);
        if (full.id !== item.id) throw new Error('Confluence source page immutable identity differs from the requested ID');
        operation = 'checkpoint-write';
        await checkpoint?.savePage(full);
        result.push(full);
      } catch (error) {
        if (signal?.aborted) throw signal.reason ?? error;
        const stub = {...sourcePage(this.profile, this.client, {...item, body: {storage: {value: '', representation: 'storage'}}}), depth: 1};
        const typed = sourceInventoryOperationError(operation, error, `/content/${item.id}`);
        result.push(stub);
        failures.push({page: stub, code: 'source-space-page-read-failed', message: typed.message, retryable: typed.retryable});
      }
    }
    if (failures.length) throw new IncompleteSourceDiscoveryError(`Source space inventory incomplete: ${failures.length}/${pages.length} page details failed`, result.map(page => ({...page, depth: 1, projectedParentId: page.parentId && result.some(parent => parent.id === page.parentId) ? canonical(this.profile, page.parentId) : `${this.profile.name}:confluence:space:${space.id}`})), {requestedStatus: 'all', effectiveStatus: 'all', returnedDescendants: pages.length, selectedDescendants: pages.length, excluded: [], maximumDepth: 1, hierarchyGaps: [], notes: []}, failures);
    return result;
  }

  async getPage(id: string): Promise<SourcePage> {
    return sourcePage(this.profile, this.client, await this.client.getPage(id));
  }

  supportsSourceStatus(_scope: import('../domain.js').TransferScope, _status: SourceStatus): boolean {
    return true;
  }

  async getDescendants(page: SourcePage, options: {status: SourceStatus; checkpoint?: import('../domain.js').SourcePageCheckpoint}) {
    const descendants = await this.client.getDescendants(page.id);
    const hydrated = await Promise.all(descendants.map(async (item) => {
      const cached = await options.checkpoint?.loadPage(item.id, item.id);
      if (cached) return cached;
      const normalized = sourcePage(
        this.profile,
        this.client,
        item.body?.storage?.value === undefined
          ? await this.client.getPage(item.id).catch((error: unknown) => {
            throw sourceInventoryOperationError('page-detail', error, `/content/${item.id}`);
          })
          : item,
      );
      await options.checkpoint?.savePage(normalized);
      return normalized;
    }));
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
      const key = confluenceSpaceKey(url.toString(), this.profile.baseUrl);
      if (key !== undefined && this.client.getSpace) {
        const space = await this.client.getSpace(key);
        return space.homepageId ? this.getPage(space.homepageId) : undefined;
      }
      return sourcePage(this.profile, this.client, await this.client.resolveTarget(url.toString()));
    }
    const [space, title] = href.includes(':') ? href.split(':', 2) : [from.space ?? '', href];
    if (!title) return undefined;
    const found = await this.client.findPageByTitle(space ?? '', title);
    return found ? sourcePage(this.profile, this.client, await this.client.getPage(found.id)) : undefined;
  }

  async listResources(page: SourcePage): Promise<SourceResource[]> {
    const attachments = await this.client.listAttachments(page.id).catch((error: unknown) => {
      throw sourceInventoryOperationError('resources-list', error, `/content/${page.id}/child/attachment`);
    });
    return attachments.map((attachment) => ({
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
      kind: attachment.metadata?.mediaType?.startsWith('image/')
        ? 'image' as const
        : diagramKindForFilename(attachment.title, attachment.metadata?.mediaType) ? 'diagram' as const : 'attachment' as const,
      metadata: {attachment},
    }));
  }

  async readComments(page: SourcePage): Promise<CommentInventory> {
    try {
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
    } catch (error) {
      throw sourceInventoryOperationError('comments-read', error, `/content/${page.id}/child/comment`);
    }
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

  async updatePage(input: {page: DestinationPage; title: string; body: string}): Promise<DestinationPage> {
    try {
      return destinationPage(this.profile, this.client, await this.client.updatePage({
        pageId: input.page.id,
        title: input.title,
        storage: input.body,
        ...(input.page.version ? {version: Number(input.page.version)} : {}),
      }));
    } catch (error) {
      if (possibleTitleConflict(error)) {
        let occupied: DestinationPage | undefined;
        try {
          occupied = await this.findTitleConflict(input.page, input.title);
        } catch {
          // Preserve revision/provider classification when lookup cannot prove a title collision.
        }
        if (occupied && occupied.id !== input.page.id) {
          throw new DestinationTitleConflictError(input.title, error.status!, {cause: error});
        }
      }
      if (error instanceof HttpRequestError && error.status === 409) {
        throw new DestinationRevisionConflictError('page', input.page.id, {cause: error});
      }
      throw error;
    }
  }

  async reparentPage(input: {
    page: DestinationPage;
    parent: DestinationContainer | DestinationPage;
  }): Promise<DestinationPage> {
    let moved: DestinationPage;
    try {
      moved = destinationPage(this.profile, this.client, await this.client.updatePage({
        pageId: input.page.id,
        title: input.page.title,
        storage: input.page.content ?? '',
        parentId: input.parent.id,
        ...(input.page.version ? {version: Number(input.page.version)} : {}),
      }));
    } catch (error) {
      if (error instanceof HttpRequestError && error.status === 409) {
        throw new DestinationRevisionConflictError('page', input.page.id, {cause: error});
      }
      throw error;
    }
    const verified = destinationPage(this.profile, this.client, await this.client.getPage(moved.id));
    if (verified.parentId !== input.parent.id) {
      throw new Error(`Confluence hierarchy verification failed for page ${input.page.id}: expected parent ${input.parent.id}, received ${verified.parentId ?? 'none'}`);
    }
    return verified;
  }

  async uploadResource(input: {page: DestinationPage; name: string; filePath: string; size?: number; mimeType?: string; existingId?: string}): Promise<UploadedResource> {
    const size = input.size ?? (await stat(input.filePath)).size;
    let uploaded: ConfluenceAttachment;
    try {
      uploaded = await this.client.uploadAttachment({
        pageId: input.page.id,
        filename: input.name,
        file: createReadStream(input.filePath),
        contentLength: size,
        ...(input.mimeType ? {mimeType: input.mimeType} : {}),
        ...(input.existingId ? {existingAttachmentId: input.existingId} : {}),
      });
    } catch (error) {
      if (error instanceof HttpRequestError && error.status === 413) {
        throw new DestinationResourceSizeLimitError(input.name, size, {cause: error});
      }
      throw error;
    }
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

  async trashEvidence(page:DestinationPage) {
    if(!this.client.trashEvidence)return {id:page.id,status:'unknown',version:'',leaf:false,allowed:false,reason:'This provider API cannot prove reversible leaf trash'};
    return this.client.trashEvidence(page.id);
  }
  async trashPage(page:DestinationPage):Promise<void> {
    if(!this.client.trashPublishedLeaf||!page.version)throw new Error('Reversible leaf trash is unavailable');
    await this.client.trashPublishedLeaf(page.id,page.version);
  }
  async verifyTrashedPage(page:DestinationPage):Promise<boolean> {
    if(!this.client.trashEvidence)return false;
    const evidence=await this.client.trashEvidence(page.id,'trashed');return evidence.id===page.id&&evidence.status==='trashed';
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
    const matches = comments
      .filter((comment) => (comment.body?.storage?.value ?? '').includes('Архив комментариев из'))
      .sort((left, right) => String(left.id).localeCompare(String(right.id), undefined, {numeric: true}));
    const candidates = fingerprint
      ? matches.filter((comment) => (comment.body?.storage?.value ?? '').includes(fingerprint))
      : matches;
    const match = candidates.at(-1);
    return match ? destinationComment(page.id, match) : undefined;
  }

  async createArchiveComment(input: {page: DestinationPage; body: string}): Promise<DestinationComment> {
    return destinationComment(input.page.id, await this.client.createComment({pageId: input.page.id, storage: input.body}));
  }

  async updateArchiveComment(input: {comment: DestinationComment; body: string}): Promise<DestinationComment> {
    try {
      return destinationComment(input.comment.pageId, await this.client.updateComment({
        commentId: input.comment.id,
        storage: input.body,
        ...(input.comment.version ? {version: Number(input.comment.version)} : {}),
      }));
    } catch (error) {
      if (error instanceof HttpRequestError && error.status === 409) {
        throw new DestinationRevisionConflictError('comment', input.comment.id, {cause: error});
      }
      throw error;
    }
  }

  async readArchiveComment(input: {page: DestinationPage; commentId: string}): Promise<DestinationComment> {
    return destinationComment(input.page.id, await this.client.getComment(input.commentId));
  }
}

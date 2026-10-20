import {createHash} from 'node:crypto';
import {stat} from 'node:fs/promises';
import type {YandexConnectionProfile} from '../config.js';
import {extractPageReferences, resolveYandexReferenceSlug} from '../content-model.js';
import type {
  AdapterCapabilities,
  CommentAuthor,
  CommentInventory,
  DestinationAdapter,
  DestinationComment,
  DestinationContainer,
  DestinationPage,
  DiscoveredPage,
  PageReference,
  SourceAdapter,
  SourceStatus,
  SourcePage,
  SourceResource,
  SourceSelection,
  UploadedResource,
} from '../domain.js';
import {DestinationRevisionConflictError, DestinationTitleConflictError, IncompleteSourceDiscoveryError} from '../domain.js';
import {normalizeCommentForest} from '../comments.js';
import {HttpRequestError} from '../http.js';
import {normalizeWikiSlug, safeFilename} from '../input.js';
import type {YandexWikiClient} from '../clients/yandex-wiki.js';
import type {YandexAttachment, YandexPageDetails, YandexPageIdentity} from '../types.js';

const capabilities: AdapterCapabilities = {
  readPages: true,
  readHierarchy: true,
  readResources: true,
  writePages: true,
  writeResources: true,
  verifyWrites: true,
  reparentPages: false,
  readComments: true,
  writeComments: true,
  updateComments: false,
};

function pageUrl(profile: YandexConnectionProfile, slug: string): string {
  return new URL(`${normalizeWikiSlug(slug)}/`, `${profile.webUrl}/`).toString();
}

function parentId(page: YandexPageDetails): string | undefined {
  return ancestorIds(page).at(-1);
}

function ancestorIds(page: YandexPageDetails): string[] {
  return (page.breadcrumbs ?? [])
    .flatMap((item) => item.id !== undefined && item.id !== page.id ? [String(item.id)] : []);
}

function canonical(profile: YandexConnectionProfile, id: string | number): string {
  return `${profile.name}:yandex-wiki:${id}`;
}

function sourcePage(profile: YandexConnectionProfile, page: YandexPageDetails): SourcePage {
  const unavailableGrid = page.page_type === 'grid' && page.content === null;
  if (typeof page.content !== 'string' && !unavailableGrid) {
    throw new Error(`Yandex Wiki page response for ${page.id} is missing content`);
  }
  const rawContent = page.content ?? '';
  const parent = parentId(page);
  const ancestors = ancestorIds(page);
  return {
    provider: 'yandex-wiki',
    profile: profile.name,
    id: String(page.id),
    canonicalId: canonical(profile, page.id),
    title: page.title || normalizeWikiSlug(page.slug).split('/').at(-1) || `Page ${page.id}`,
    locator: normalizeWikiSlug(page.slug),
    url: pageUrl(profile, page.slug),
    ...(parent ? {parentId: parent} : {}),
    ...(ancestors.length > 0 ? {ancestorIds: ancestors} : {}),
    rawContent,
    rawFormat: 'yfm',
    ...(unavailableGrid ? {
      contentAvailability: {
        status: 'provider-unavailable' as const,
        sourceType: page.page_type,
        reason: 'provider-null-body' as const,
      },
    } : {}),
    ...(page.attributes?.modified_at ? {modifiedAt: page.attributes.modified_at, version: page.attributes.modified_at} : {}),
    references: extractPageReferences(rawContent, 'yfm'),
  };
}

function sourceDetailFailure(error: unknown): {code: string; message: string; retryable: boolean} {
  const message = error instanceof Error ? error.message : String(error);
  if (!(error instanceof HttpRequestError)) {
    return {
      code: /schema error|missing content/i.test(message) ? 'source-page-detail-invalid' : 'source-page-detail-provider-error',
      message,
      retryable: false,
    };
  }
  if (error.status === 429) return {code: 'rate-limit-source-page-detail', message, retryable: true};
  if ((error.status ?? 0) >= 500) return {code: 'network-source-page-detail', message, retryable: true};
  if (error.status === 401) return {code: 'authorization-source-page-detail', message, retryable: false};
  if (error.status === 403) return {code: 'permissions-source-page-detail', message, retryable: false};
  if (error.status === undefined && error.code !== 'ERR_CANCELED') {
    return {code: 'network-source-page-detail', message, retryable: true};
  }
  return {code: 'source-page-detail-provider-error', message, retryable: false};
}

function sourceIdentityStub(
  profile: YandexConnectionProfile,
  root: SourcePage,
  identity: YandexPageIdentity,
  selected: YandexPageIdentity[],
  currentOnly: boolean,
): SourcePage {
  const locator = normalizeWikiSlug(identity.slug);
  const byLocator = new Map<string, string>([
    [normalizeWikiSlug(root.locator), root.id],
    ...selected.map((item): [string, string] => [normalizeWikiSlug(item.slug), String(item.id)]),
  ]);
  const segments = locator.split('/').filter(Boolean);
  const ancestorIds = segments.slice(0, -1)
    .map((_segment, index) => byLocator.get(segments.slice(0, index + 1).join('/')))
    .filter((value): value is string => Boolean(value) && value !== String(identity.id));
  const parent = ancestorIds.at(-1);
  return {
    provider: 'yandex-wiki',
    profile: profile.name,
    id: String(identity.id),
    canonicalId: canonical(profile, identity.id),
    title: segments.at(-1) || `Page ${identity.id}`,
    locator,
    url: pageUrl(profile, locator),
    ...(parent ? {parentId: parent} : {}),
    ...(ancestorIds.length > 0 ? {ancestorIds} : {}),
    ...(currentOnly ? {sourceStatus: 'current' as const} : {}),
    rawContent: '',
    rawFormat: 'yfm',
    references: [],
  };
}

function projectDiscoveryEvidence(root: SourcePage, descendants: SourcePage[]): DiscoveredPage[] {
  const pages = [root, ...descendants.filter((page) => page.canonicalId !== root.canonicalId)];
  const byProviderId = new Map(pages.map((page) => [page.id, page]));
  const projectedParents = new Map<string, string | undefined>([[root.canonicalId, undefined]]);
  for (const page of pages.slice(1)) {
    const ancestor = [...(page.ancestorIds ?? (page.parentId ? [page.parentId] : []))]
      .reverse()
      .map((id) => byProviderId.get(id))
      .find(Boolean);
    projectedParents.set(page.canonicalId, (ancestor ?? root).canonicalId);
  }
  const depths = new Map<string, number>([[root.canonicalId, 0]]);
  const depthOf = (canonicalId: string): number => {
    const cached = depths.get(canonicalId);
    if (cached !== undefined) return cached;
    const trail: string[] = [];
    let current: string | undefined = canonicalId;
    const seen = new Set<string>();
    while (current && depths.get(current) === undefined && !seen.has(current)) {
      seen.add(current);
      trail.push(current);
      current = projectedParents.get(current);
    }
    let depth = current ? depths.get(current) ?? 0 : 0;
    for (const item of trail.reverse()) {
      depth += 1;
      depths.set(item, depth);
    }
    return depths.get(canonicalId) ?? 1;
  };
  return pages.map((page): DiscoveredPage => {
    const projectedParentId = projectedParents.get(page.canonicalId);
    return {...page, depth: depthOf(page.canonicalId), ...(projectedParentId ? {projectedParentId} : {})};
  }).sort((left, right) => left.depth - right.depth || left.canonicalId.localeCompare(right.canonicalId));
}

function destinationPage(profile: YandexConnectionProfile, page: YandexPageDetails): DestinationPage {
  const content = page.content ?? '';
  const fingerprint = createHash('sha256').update(`${page.title}\0${content}`).digest('hex');
  const parent = parentId(page);
  return {
    provider: 'yandex-wiki',
    profile: profile.name,
    id: String(page.id),
    canonicalId: canonical(profile, page.id),
    title: page.title,
    url: pageUrl(profile, page.slug),
    locator: normalizeWikiSlug(page.slug),
    ...(parent ? {parentId: parent} : {}),
    ...(page.attributes?.modified_at ? {version: page.attributes.modified_at} : {}),
    fingerprint,
    content,
    contentFingerprint: createHash('sha256').update(content).digest('hex'),
    contentLength: Buffer.byteLength(content),
  };
}

function destinationContainer(profile: YandexConnectionProfile, page: YandexPageDetails): DestinationContainer {
  return {
    provider: 'yandex-wiki',
    profile: profile.name,
    id: String(page.id),
    canonicalId: canonical(profile, page.id),
    title: page.title,
    url: pageUrl(profile, page.slug),
    locator: normalizeWikiSlug(page.slug),
  };
}

function slugSegment(value: string): string {
  const normalized = value.normalize('NFKD').toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'page';
}

function attachmentSize(value: string | number): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? Math.round(value) : undefined;
  const match = value.trim().match(/^(\d+(?:[.,]\d+)?)\s*(B|KB|KIB|MB|MIB|GB|GIB)?$/i);
  if (!match?.[1]) return undefined;
  if (!match[2] && /[.,]/.test(match[1])) return undefined;
  const number = Number(match[1].replace(',', '.'));
  const unit = match[2]?.toLocaleUpperCase() ?? 'B';
  const multiplier = unit === 'KB' ? 1_000
    : unit === 'KIB' ? 1_024
      : unit === 'MB' ? 1_000_000
        : unit === 'MIB' ? 1_048_576
          : unit === 'GB' ? 1_000_000_000
            : unit === 'GIB' ? 1_073_741_824
              : 1;
  const bytes = Math.round(number * multiplier);
  return Number.isFinite(bytes) && bytes > 0 ? bytes : undefined;
}

function attachmentResource(profile: YandexConnectionProfile, page: SourcePage, attachment: YandexAttachment): SourceResource {
  const numericSize = attachmentSize(attachment.size);
  let preferredName = attachment.name;
  let pathname: string | undefined;
  try {
    const url = new URL(attachment.download_url, page.url);
    pathname = decodeURIComponent(url.pathname);
    preferredName = pathname.split('/').filter(Boolean).at(-1) ?? attachment.name;
  } catch {
    // Keep the API name when a provider returns a non-URL download reference.
  }
  return {
    provider: 'yandex-wiki',
    id: String(attachment.id),
    pageId: page.id,
    name: attachment.name,
    preferredName,
    referenceAliases: [attachment.name, preferredName, attachment.download_url, pathname]
      .filter((value): value is string => Boolean(value)),
    ...(numericSize !== undefined ? {size: numericSize} : {}),
    ...(attachment.mimetype ? {mimeType: attachment.mimetype} : {}),
    ...(attachment.download_url ? {downloadUrl: attachment.download_url} : {}),
    kind: attachment.has_preview ? 'image' : 'attachment',
    metadata: {profile: profile.name},
  };
}

function yandexAuthor(value: import('../types.js').YandexComment['author']): CommentAuthor {
  const providerId = String(value?.id ?? value?.uid ?? value?.cloud_uid ?? value?.username ?? value?.email ?? 'unknown');
  return {
    providerId,
    ...(value?.display_name ?? value?.name ? {displayName: value?.display_name ?? value?.name} : {}),
    ...(value?.username ? {username: value.username} : {}),
    ...(value?.public_name ? {publicName: value.public_name} : {}),
    ...(value?.email ? {email: value.email} : {}),
  };
}

function destinationComment(pageId: string, value: import('../types.js').YandexComment): DestinationComment {
  const body = value.body ?? '';
  return {
    id: String(value.id),
    pageId,
    body,
    ...(value.created_at ? {version: value.created_at} : {}),
    fingerprint: createHash('sha256').update(body).digest('hex'),
  };
}

export class YandexAdapter implements SourceAdapter, DestinationAdapter {
  readonly kind = 'yandex-wiki' as const;
  readonly capabilities = capabilities;

  constructor(public readonly profile: YandexConnectionProfile, private readonly client: YandexWikiClient) {}

  async preflight(): Promise<{product: string; warnings: string[]}> {
    return {product: 'Yandex Wiki Public API v1', warnings: []};
  }

  async resolvePage(locator: string): Promise<SourcePage> {
    const trimmed = locator.trim();
    if (/^\d+$/.test(trimmed)) return sourcePage(this.profile, await this.client.getPageById(Number(trimmed)));
    let slug = trimmed;
    try {
      const url = new URL(trimmed);
      const base = new URL(this.profile.webUrl);
      if (url.origin !== base.origin) throw new Error(`Yandex Wiki source host must match ${base.origin}`);
      slug = url.pathname.slice(base.pathname.replace(/\/+$/, '').length);
    } catch (error) {
      if (/^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)) throw error;
    }
    return sourcePage(this.profile, await this.client.getPageBySlug(normalizeWikiSlug(slug)));
  }

  async getPage(id: string): Promise<SourcePage> {
    return sourcePage(this.profile, await this.client.getPageById(Number(id)));
  }

  supportsSourceStatus(scope: import('../domain.js').TransferScope, status: SourceStatus): boolean {
    return status === 'all' || scope !== 'linked';
  }

  async getDescendants(page: SourcePage, options: {status: SourceStatus}) {
    const all = await this.client.getDescendants(Number(page.id));
    const current = options.status === 'current'
      ? await this.client.getDescendants(Number(page.id), {actuality: 'actual'})
      : all;
    const allIds = new Set(all.map((identity) => identity.id));
    const unexpectedCurrent = current.filter((identity) => !allIds.has(identity.id));
    if (unexpectedCurrent.length > 0) {
      throw new Error(`Yandex Wiki actuality inventory changed during discovery; ${unexpectedCurrent.length} current page(s) were absent from the complete enumeration`);
    }
    const currentIds = new Set(current.map((identity) => identity.id));
    const selected = options.status === 'current' ? all.filter((identity) => currentIds.has(identity.id)) : all;
    const excludedIdentities = options.status === 'current' ? all.filter((identity) => !currentIds.has(identity.id)) : [];
    const locatorDrifts: string[] = [];
    const results = await Promise.allSettled(selected.map(async (identity) => {
      const detail = await this.client.getPageById(identity.id);
      const normalized = sourcePage(this.profile, detail);
      const expectedLocator = normalizeWikiSlug(identity.slug);
      if (normalized.locator !== expectedLocator) {
        locatorDrifts.push(`Yandex Wiki page ${identity.id} changed locator from ${expectedLocator} to ${normalized.locator} during discovery; immutable ID was retained.`);
      }
      const belongsToSubtree = normalized.ancestorIds?.includes(page.id)
        ?? (normalized.locator === page.locator || normalized.locator.startsWith(`${page.locator}/`));
      return {
        page: options.status === 'current' ? {...normalized, sourceStatus: 'current' as const} : normalized,
        belongsToSubtree,
        expectedLocator,
      };
    }));
    const detailFailures = results.flatMap((result, index) => {
      const identity = selected[index];
      if (result.status !== 'rejected' || !identity) return [];
      return [{identity, ...sourceDetailFailure(result.reason)}];
    });
    const excludedResults = await Promise.allSettled(excludedIdentities.map(async (identity) => {
      const detail = await this.client.getPageById(identity.id);
      const locator = normalizeWikiSlug(detail.slug);
      const ancestors = ancestorIds(detail);
      const rootIndex = ancestors.indexOf(page.id);
      const immediateParentId = parentId(detail);
      return {
        id: String(identity.id),
        canonicalId: canonical(this.profile, identity.id),
        locator,
        title: detail.title || locator.split('/').at(-1) || `Page ${identity.id}`,
        url: pageUrl(this.profile, locator),
        ...(immediateParentId ? {parentId: immediateParentId} : {}),
        ...(ancestors.length > 0 ? {ancestorIds: ancestors} : {}),
        ...(rootIndex >= 0 ? {depth: ancestors.length - rootIndex} : {}),
        reason: 'source-status' as const,
        status: 'obsolete' as const,
        metadataComplete: true,
      };
    }));
    const excludedFailures = excludedResults.filter((result) => result.status === 'rejected').length;
    const pages = results.flatMap((result) => result.status === 'fulfilled' && result.value.belongsToSubtree ? [result.value.page] : []);
    const excluded = [
      ...excludedResults.map((result, index) => result.status === 'fulfilled' ? result.value : {
        id: String(excludedIdentities[index]!.id),
        canonicalId: canonical(this.profile, excludedIdentities[index]!.id),
        locator: normalizeWikiSlug(excludedIdentities[index]!.slug),
        reason: 'source-status' as const,
        status: 'obsolete' as const,
        metadataComplete: false,
      }),
      ...results.flatMap((result) => result.status === 'fulfilled' && !result.value.belongsToSubtree ? [{
        id: result.value.page.id,
        canonicalId: result.value.page.canonicalId,
        locator: result.value.page.locator,
        title: result.value.page.title,
        url: result.value.page.url,
        ...(result.value.page.parentId ? {parentId: result.value.page.parentId} : {}),
        ...(result.value.page.ancestorIds ? {ancestorIds: result.value.page.ancestorIds} : {}),
        reason: 'inventory-drift' as const,
        ...(result.value.page.sourceStatus ? {status: result.value.page.sourceStatus} : {}),
        metadataComplete: true,
      }] : []),
    ];
    const notes = [
      ...(excludedFailures > 0 ? [`Yandex Wiki did not expose complete hierarchy metadata for ${excludedFailures} excluded page(s).`] : []),
      ...(results.some((result) => result.status === 'fulfilled' && !result.value.belongsToSubtree)
        ? ['Yandex Wiki inventory changed during discovery; pages moved outside the selected subtree were excluded by immutable page ID.']
        : []),
      ...locatorDrifts,
    ];
    if (detailFailures.length > 0) {
      const failedPages = detailFailures.map(({identity}) => sourceIdentityStub(
        this.profile,
        page,
        identity,
        selected,
        options.status === 'current',
      ));
      const evidencePages = projectDiscoveryEvidence(page, [...pages, ...failedPages]);
      const evidenceById = new Map(evidencePages.map((item) => [item.id, item]));
      const selection: SourceSelection = {
        requestedStatus: options.status,
        effectiveStatus: options.status,
        returnedDescendants: all.length,
        selectedDescendants: evidencePages.length - 1,
        excluded,
        maximumDepth: Math.max(0, ...evidencePages.map((item) => item.depth)),
        hierarchyGaps: [],
        notes: [...notes, 'Selected page detail hydration was incomplete; no destination mutation was attempted.'],
      };
      const message = `Yandex Wiki descendant inventory is incomplete: ${detailFailures.length} of ${selection.selectedDescendants} selected page detail request(s) failed`;
      throw new IncompleteSourceDiscoveryError(
        message,
        evidencePages,
        selection,
        detailFailures.map((failure) => ({
          page: evidenceById.get(String(failure.identity.id))!,
          code: failure.code,
          message: failure.message,
          retryable: failure.retryable,
        })),
      );
    }
    return {
      pages,
      returned: all.length,
      excluded,
      effectiveStatus: options.status,
      notes,
    };
  }

  async resolveReference(from: SourcePage, reference: PageReference): Promise<SourcePage | undefined> {
    if (reference.kind !== 'page' || !reference.href) return undefined;
    const slug = resolveYandexReferenceSlug(from, reference.href);
    if (!slug) return undefined;
    return sourcePage(this.profile, await this.client.getPageBySlug(slug));
  }

  async listResources(page: SourcePage): Promise<SourceResource[]> {
    const [attachments, grids] = await Promise.all([
      this.client.getAttachments(Number(page.id)),
      this.client.getPageGrids(Number(page.id)),
    ]);
    const attachmentItems = attachments.filter((attachment) => attachment.is_downloadable).map((attachment) => attachmentResource(this.profile, page, attachment));
    const gridItems = await Promise.all(grids.map(async (summary): Promise<SourceResource> => ({
      provider: 'yandex-wiki',
      id: summary.id,
      pageId: page.id,
      name: `${safeFilename(summary.title)}.grid.json`,
      kind: 'grid',
      metadata: {grid: await this.client.getGrid(summary.id)},
    })));
    return [...attachmentItems, ...gridItems];
  }

  async readComments(page: SourcePage): Promise<CommentInventory> {
    const topLevel = await this.client.getPageComments(Number(page.id));
    const all = new Map<string, import('../types.js').YandexComment>();
    for (const root of topLevel) {
      all.set(String(root.id), root);
      const thread = await this.client.getCommentThread(Number(page.id), String(root.id));
      for (const entry of thread) if (!all.has(String(entry.id))) all.set(String(entry.id), entry);
    }
    return normalizeCommentForest([...all.values()].map((entry) => ({
      id: String(entry.id),
      ...(entry.parent_id !== undefined && entry.parent_id !== null ? {parentId: String(entry.parent_id)} : {}),
      ...(entry.thread_id !== undefined && entry.thread_id !== null ? {threadId: String(entry.thread_id)} : {}),
      author: yandexAuthor(entry.author),
      ...(entry.created_at ? {createdAt: entry.created_at} : {}),
      body: entry.body ?? (entry.is_deleted ? '[Комментарий удалён]' : ''),
      ...(entry.inline_text ? {inlineContext: entry.inline_text} : {}),
      status: entry.is_deleted ? 'deleted' : /resolved/i.test(entry.resolve_status ?? '') ? 'resolved' : 'open',
    })), 'yfm');
  }

  downloadResource(resource: SourceResource, destination: string) {
    if (resource.kind === 'grid') throw new Error(`Grid ${resource.name} is normalized as page content and is not downloadable`);
    return this.client.download(Number(resource.pageId), Number(resource.id), destination);
  }

  async resolveContainer(locator: string): Promise<DestinationContainer> {
    const page = await this.resolvePage(locator);
    const details = await this.client.getPageById(Number(page.id));
    if (details.attributes?.is_readonly) {
      throw new Error(`Yandex Wiki destination page ${details.slug} is read-only for the current user`);
    }
    return destinationContainer(this.profile, details);
  }

  private childSlug(container: DestinationContainer | DestinationPage, title: string): string {
    if (!container.locator) throw new Error(`Yandex Wiki destination ${container.id} is missing a slug`);
    return `${normalizeWikiSlug(container.locator)}/${slugSegment(title)}`;
  }

  async findChild(container: DestinationContainer | DestinationPage, title: string): Promise<DestinationPage | undefined> {
    try {
      return destinationPage(this.profile, await this.client.getPageBySlug(this.childSlug(container, title)));
    } catch (error) {
      if (error instanceof HttpRequestError && error.status === 404) return undefined;
      throw error;
    }
  }

  findRecoverablePage(container: DestinationContainer | DestinationPage, title: string): Promise<DestinationPage | undefined> {
    return this.findChild(container, title);
  }

  async createPage(input: {container: DestinationContainer | DestinationPage; title: string; body: string}): Promise<DestinationPage> {
    try {
      const created = await this.client.createPage({slug: this.childSlug(input.container, input.title), title: input.title, content: input.body});
      return destinationPage(this.profile, created);
    } catch (error) {
      if (error instanceof HttpRequestError && (error.status === 400 || error.status === 409)) {
        const occupied = await this.findChild(input.container, input.title).catch(() => undefined);
        if (occupied) throw new DestinationTitleConflictError(input.title, error.status, {cause: error});
      }
      throw error;
    }
  }

  async updatePage(input: {page: DestinationPage; title: string; body: string}): Promise<DestinationPage> {
    try {
      return destinationPage(this.profile, await this.client.updatePage({id: Number(input.page.id), title: input.title, content: input.body}));
    } catch (error) {
      if (error instanceof HttpRequestError && error.status === 409) {
        throw new DestinationRevisionConflictError('page', input.page.id, {cause: error});
      }
      throw error;
    }
  }

  async uploadResource(input: {page: DestinationPage; name: string; filePath: string; size?: number; mimeType?: string}): Promise<UploadedResource> {
    const size = input.size ?? (await stat(input.filePath)).size;
    const attachment = await this.client.uploadAttachment({pageId: Number(input.page.id), filename: input.name, path: input.filePath, size});
    return {id: String(attachment.id), name: attachment.name, size, ...(attachment.download_url ? {url: attachment.download_url} : {})};
  }

  async listUploadedResources(page: DestinationPage): Promise<UploadedResource[]> {
    const attachments = await this.client.getAttachments(Number(page.id));
    return attachments.map((attachment) => {
      const size = attachmentSize(attachment.size);
      return {
        id: String(attachment.id),
        name: attachment.name,
        ...(size !== undefined ? {size} : {}),
        ...(attachment.download_url ? {url: attachment.download_url} : {}),
      };
    });
  }

  async downloadUploadedResource(input: {page: DestinationPage; resource: UploadedResource; destination: string}) {
    return this.client.download(Number(input.page.id), Number(input.resource.id), input.destination);
  }

  async verifyPage(page: DestinationPage): Promise<DestinationPage> {
    return destinationPage(this.profile, await this.client.getPageById(Number(page.id)));
  }

  renderPageReference(page: DestinationPage, label: string, anchor?: string): string {
    return `[${label}](${page.url}${anchor ? `#${anchor}` : ''})`;
  }

  renderResourceReference(resource: UploadedResource, label: string, image: boolean): string {
    const href = resource.url ?? resource.name;
    return image ? `![${label}](${href})` : `[${label}](${href})`;
  }

  async findArchiveComment(page: DestinationPage, fingerprint?: string): Promise<DestinationComment | undefined> {
    const comments = await this.client.getPageComments(Number(page.id));
    const matches = comments
      .filter((comment) => (comment.body ?? '').includes('Архив комментариев из'))
      .sort((left, right) => String(left.id).localeCompare(String(right.id), undefined, {numeric: true}));
    const candidates = fingerprint
      ? matches.filter((comment) => (comment.body ?? '').includes(fingerprint))
      : matches;
    const match = candidates.at(-1);
    return match ? destinationComment(page.id, match) : undefined;
  }

  async createArchiveComment(input: {page: DestinationPage; body: string}): Promise<DestinationComment> {
    return destinationComment(input.page.id, await this.client.createComment({pageId: Number(input.page.id), body: input.body}));
  }

  async readArchiveComment(input: {page: DestinationPage; commentId: string}): Promise<DestinationComment> {
    const comments = await this.client.getCommentThread(Number(input.page.id), input.commentId);
    const found = comments.find((comment) => String(comment.id) === input.commentId)
      ?? (await this.client.getPageComments(Number(input.page.id))).find((comment) => String(comment.id) === input.commentId);
    if (!found) throw new Error(`Yandex Wiki comment ${input.commentId} was not found on page ${input.page.id}`);
    return destinationComment(input.page.id, found);
  }
}

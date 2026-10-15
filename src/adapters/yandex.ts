import {createHash} from 'node:crypto';
import {stat} from 'node:fs/promises';
import type {YandexConnectionProfile} from '../config.js';
import {extractPageReferences, resolveYandexReferenceSlug} from '../content-model.js';
import type {
  AdapterCapabilities,
  DestinationAdapter,
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
import {normalizeWikiSlug, safeFilename} from '../input.js';
import type {YandexWikiClient} from '../clients/yandex-wiki.js';
import type {YandexAttachment, YandexPageDetails} from '../types.js';

const capabilities: AdapterCapabilities = {
  readPages: true,
  readHierarchy: true,
  readResources: true,
  writePages: true,
  writeResources: true,
  verifyWrites: true,
  reparentPages: false,
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
  if (page.content === undefined) throw new Error(`Yandex Wiki page response for ${page.id} is missing content`);
  const rawContent = page.content;
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
    ...(page.attributes?.modified_at ? {modifiedAt: page.attributes.modified_at, version: page.attributes.modified_at} : {}),
    references: extractPageReferences(rawContent, 'yfm'),
  };
}

function destinationPage(profile: YandexConnectionProfile, page: YandexPageDetails): DestinationPage {
  const content = page.content ?? '';
  const fingerprint = createHash('sha256').update(`${page.title}\0${content}\0${page.attributes?.modified_at ?? ''}`).digest('hex');
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
    const results = await Promise.allSettled(selected.map(async (identity) => {
      const detail = await this.client.getPageById(identity.id);
      const normalized = sourcePage(this.profile, detail);
      const expectedLocator = normalizeWikiSlug(identity.slug);
      if (normalized.locator !== expectedLocator) {
        throw new Error(`Yandex Wiki descendant ${identity.id} detail slug ${normalized.locator} conflicts with inventory slug ${expectedLocator}`);
      }
      return options.status === 'current' ? {...normalized, sourceStatus: 'current' as const} : normalized;
    }));
    const failures = results.flatMap((result, index) => result.status === 'rejected'
      ? [`${selected[index]?.id ?? 'unknown'} (${selected[index]?.slug ?? 'unknown'}): ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`]
      : []);
    if (failures.length > 0) {
      throw new Error(`Yandex Wiki descendant inventory is incomplete; ${failures.length} page detail request(s) failed: ${failures.join('; ')}`);
    }
    return {
      pages: results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []),
      returned: all.length,
      excluded: options.status === 'current'
        ? all.filter((identity) => !currentIds.has(identity.id)).map((identity) => ({
          id: String(identity.id), locator: normalizeWikiSlug(identity.slug), reason: 'source-status' as const, status: 'obsolete',
        }))
        : [],
      effectiveStatus: options.status,
      notes: [],
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
    const created = await this.client.createPage({slug: this.childSlug(input.container, input.title), title: input.title, content: input.body});
    return destinationPage(this.profile, created);
  }

  async updatePage(input: {page: DestinationPage; title: string; body: string; expectedFingerprint?: string}): Promise<DestinationPage> {
    if (input.expectedFingerprint) {
      const current = destinationPage(this.profile, await this.client.getPageById(Number(input.page.id)));
      if (current.fingerprint !== input.expectedFingerprint) throw new Error(`Destination conflict for Yandex Wiki page ${input.page.id}: content changed since the last verified run`);
    }
    return destinationPage(this.profile, await this.client.updatePage({id: Number(input.page.id), title: input.title, content: input.body}));
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
}

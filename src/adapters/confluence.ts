import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import type {ConfluenceConnectionProfile} from '../config.js';
import {extractPageReferences} from '../content-model.js';
import type {
  AdapterCapabilities,
  DestinationAdapter,
  DestinationContainer,
  DestinationPage,
  PageReference,
  SourceAdapter,
  SourcePage,
  SourceResource,
  UploadedResource,
} from '../domain.js';
import type {ConfluenceApi, ConfluenceAttachment, ConfluencePage} from '../types.js';

const capabilities: AdapterCapabilities = {
  readPages: true,
  readHierarchy: true,
  readResources: true,
  writePages: true,
  writeResources: true,
  verifyWrites: true,
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
    ...(page.version?.number ? {version: String(page.version.number)} : {}),
    fingerprint: fingerprint(page),
    content,
    contentFingerprint: contentFingerprint(content),
    contentLength: Buffer.byteLength(content),
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

  async getDescendants(page: SourcePage): Promise<SourcePage[]> {
    const descendants = await this.client.getDescendants(page.id);
    return Promise.all(descendants.map(async (item) => sourcePage(
      this.profile,
      this.client,
      item.body?.storage?.value === undefined ? await this.client.getPage(item.id) : item,
    )));
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
      ...(attachment.extensions?.fileSize !== undefined ? {size: attachment.extensions.fileSize} : {}),
      ...(attachment.metadata?.mediaType ? {mimeType: attachment.metadata.mediaType} : {}),
      ...(attachment._links?.download ? {downloadUrl: attachment._links.download} : {}),
      kind: attachment.metadata?.mediaType?.startsWith('image/') ? 'image' as const : 'attachment' as const,
      metadata: {attachment},
    }));
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
    const space = container.space;
    if (!space) return undefined;
    const found = await this.client.findPageByTitle(space, title);
    if (!found) return undefined;
    return destinationPage(this.profile, this.client, await this.client.getPage(found.id));
  }

  async createPage(input: {container: DestinationContainer | DestinationPage; title: string; body: string}): Promise<DestinationPage> {
    const space = input.container.space;
    if (!space) throw new Error(`Confluence destination ${input.container.id} is missing a space key`);
    return destinationPage(this.profile, this.client, await this.client.createPage({
      spaceKey: space, parentId: input.container.id, title: input.title, storage: input.body,
    }));
  }

  async updatePage(input: {page: DestinationPage; title: string; body: string; expectedFingerprint?: string}): Promise<DestinationPage> {
    if (input.expectedFingerprint) {
      const current = destinationPage(this.profile, this.client, await this.client.getPage(input.page.id));
      if (current.fingerprint !== input.expectedFingerprint) throw new Error(`Destination conflict for Confluence page ${input.page.id}: content changed since the last verified run`);
    }
    return destinationPage(this.profile, this.client, await this.client.updatePage({pageId: input.page.id, title: input.title, storage: input.body}));
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
}

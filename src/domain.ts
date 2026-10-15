import type {ConnectionProfile} from './config.js';

export type ProviderKind = 'yandex-wiki' | 'confluence';
export type TransferScope = 'page' | 'subtree' | 'linked';
export type ExportFormat = 'markdown' | 'html';
export type RawContentFormat = 'yfm' | 'confluence-storage';

export interface PageReference {
  raw: string;
  href?: string;
  pageTitle?: string;
  anchor?: string;
  kind: 'page' | 'attachment' | 'anchor' | 'external' | 'unsupported';
}

export interface SourcePage {
  provider: ProviderKind;
  profile: string;
  id: string;
  canonicalId: string;
  title: string;
  locator: string;
  url: string;
  parentId?: string;
  space?: string;
  rawContent: string;
  rawFormat: RawContentFormat;
  modifiedAt?: string;
  version?: string;
  references: PageReference[];
}

export interface SourceResource {
  provider: ProviderKind;
  id: string;
  pageId: string;
  name: string;
  size?: number;
  mimeType?: string;
  downloadUrl?: string;
  kind: 'attachment' | 'image' | 'grid';
  metadata?: Record<string, unknown>;
}

export interface DestinationContainer {
  provider: ProviderKind;
  profile: string;
  id: string;
  canonicalId: string;
  title: string;
  url: string;
  space?: string;
  locator?: string;
}

export interface DestinationPage {
  provider: ProviderKind;
  profile: string;
  id: string;
  canonicalId: string;
  title: string;
  url: string;
  locator?: string;
  space?: string;
  version?: string;
  fingerprint?: string;
  content?: string;
  contentFingerprint?: string;
  contentLength?: number;
}

export interface UploadedResource {
  id: string;
  name: string;
  url?: string;
  size?: number;
  fingerprint?: string;
}

export type RenderResourceBinding =
  | {kind: 'uploaded'; resource: UploadedResource}
  | {kind: 'source'; resource: SourceResource; url?: string}
  | {kind: 'file'; path: string; name: string};

export interface AdapterCapabilities {
  readPages: boolean;
  readHierarchy: boolean;
  readResources: boolean;
  writePages: boolean;
  writeResources: boolean;
  verifyWrites: boolean;
}

export interface SourceAdapter {
  readonly profile: ConnectionProfile;
  readonly kind: ProviderKind;
  readonly capabilities: AdapterCapabilities;
  preflight(): Promise<{product: string; version?: string; warnings: string[]}>;
  resolvePage(locator: string): Promise<SourcePage>;
  getPage(id: string): Promise<SourcePage>;
  getDescendants(page: SourcePage): Promise<SourcePage[]>;
  resolveReference(from: SourcePage, reference: PageReference): Promise<SourcePage | undefined>;
  listResources(page: SourcePage): Promise<SourceResource[]>;
  downloadResource(resource: SourceResource, destination: string): Promise<{path: string; size: number; sha256: string; mimeType?: string}>;
}

export interface DestinationAdapter {
  readonly profile: ConnectionProfile;
  readonly kind: ProviderKind;
  readonly capabilities: AdapterCapabilities;
  preflight(): Promise<{product: string; version?: string; warnings: string[]}>;
  resolveContainer(locator: string): Promise<DestinationContainer>;
  findChild(container: DestinationContainer | DestinationPage, title: string): Promise<DestinationPage | undefined>;
  createPage(input: {container: DestinationContainer | DestinationPage; title: string; body: string}): Promise<DestinationPage>;
  updatePage(input: {page: DestinationPage; title: string; body: string; expectedFingerprint?: string}): Promise<DestinationPage>;
  uploadResource(input: {
    page: DestinationPage;
    name: string;
    filePath: string;
    size?: number;
    mimeType?: string;
    existingId?: string;
  }): Promise<UploadedResource>;
  listUploadedResources(page: DestinationPage): Promise<UploadedResource[]>;
  verifyPage(page: DestinationPage): Promise<DestinationPage>;
  renderPageReference(page: DestinationPage, label: string, anchor?: string): string;
  renderResourceReference(resource: UploadedResource, label: string, image: boolean): string;
}

export type GraphEdgeStatus = 'resolved' | 'external' | 'inaccessible' | 'broken' | 'cycle' | 'unsupported';

export interface PageGraphEdge {
  from: string;
  raw: string;
  to?: string;
  status: GraphEdgeStatus;
  message?: string;
}

export interface DiscoveredPage extends SourcePage {
  depth: number;
  projectedParentId?: string;
}

export interface PageGraph {
  rootId: string;
  pages: DiscoveredPage[];
  edges: PageGraphEdge[];
  warnings: string[];
}

export interface NormalizedReference {
  token: string;
  kind: PageReference['kind'];
  raw: string;
  href?: string;
  pageId?: string;
  resourceName?: string;
  label: string;
  anchor?: string;
}

export interface NormalizedNode {
  type: 'document' | 'html' | 'page-reference' | 'resource-reference' | 'vendor-extension' | 'fallback';
  value?: string;
  children?: NormalizedNode[];
  reference?: NormalizedReference;
  vendor?: ProviderKind;
}

export interface NormalizedDocument {
  root: NormalizedNode;
  raw: string;
  rawFormat: RawContentFormat;
  references: NormalizedReference[];
  warnings: string[];
  degraded: boolean;
  metrics: {
    links: number;
    images: number;
    tables: number;
    codeBlocks: number;
  };
}

export interface RenderContext {
  pages: Map<string, DestinationPage | {path: string; title: string}>;
  resources: Map<string, RenderResourceBinding>;
  sourcePages: Map<string, SourcePage>;
  currentPageId: string;
  currentPath?: string;
}

export interface RenderedDocument {
  body: string;
  warnings: string[];
  degraded: boolean;
  representedReferences: number;
}

export function assertTransferCapabilities(
  source: SourceAdapter,
  destination: DestinationAdapter | undefined,
  scope: TransferScope,
): void {
  const missing: string[] = [];
  if (!source.capabilities.readPages) missing.push(`${source.profile.name}: read pages`);
  if (scope !== 'page' && !source.capabilities.readHierarchy) missing.push(`${source.profile.name}: read hierarchy`);
  if (!source.capabilities.readResources) missing.push(`${source.profile.name}: read resources`);
  if (destination && !destination.capabilities.writePages) missing.push(`${destination.profile.name}: write pages`);
  if (destination && !destination.capabilities.writeResources) missing.push(`${destination.profile.name}: write resources`);
  if (destination && !destination.capabilities.verifyWrites) missing.push(`${destination.profile.name}: verify writes`);
  if (missing.length > 0) throw new Error(`Selected direction lacks required capabilities: ${missing.join(', ')}.`);
}

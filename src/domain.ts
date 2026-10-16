import type {ConnectionProfile} from './config.js';

export type ProviderKind = 'yandex-wiki' | 'confluence';
export type TransferScope = 'page' | 'subtree' | 'linked';
export type SourceStatus = 'all' | 'current';
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
  /** Ordered provider page IDs from the highest available ancestor to the direct parent. */
  ancestorIds?: string[];
  /** Normalized status when the provider exposes it for this page. */
  sourceStatus?: 'current' | 'non-current';
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
  /** Provider-derived filename that best matches references in source content. */
  preferredName?: string;
  /** Exact provider references that may identify this resource in source markup. */
  referenceAliases?: string[];
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
  parentId?: string;
  version?: string;
  fingerprint?: string;
  content?: string;
  contentFingerprint?: string;
  contentLength?: number;
}

export class DestinationTitleConflictError extends Error {
  constructor(
    readonly title: string,
    readonly status: number,
    options?: ErrorOptions,
  ) {
    super(`Destination already contains a page titled "${title}"`, options);
    this.name = 'DestinationTitleConflictError';
  }
}

export interface UploadedResource {
  id: string;
  name: string;
  url?: string;
  size?: number;
  fingerprint?: string;
}

export interface CommentAuthor {
  providerId: string;
  displayName?: string;
  username?: string;
  publicName?: string;
  email?: string;
}

export interface CommentAttachmentReference {
  raw: string;
  href: string;
  label?: string;
  resourceId?: string;
}

export interface CommentEntry {
  id: string;
  parentId?: string;
  threadId: string;
  author: CommentAuthor;
  createdAt?: string;
  body: string;
  inlineContext?: string;
  status?: 'open' | 'resolved' | 'deleted';
  attachments: CommentAttachmentReference[];
  links: PageReference[];
  replies: CommentEntry[];
}

export interface CommentThread {
  id: string;
  root: CommentEntry;
  participants: CommentAuthor[];
}

export interface CommentInventory {
  status: 'complete' | 'empty' | 'failed' | 'skipped';
  threads: CommentThread[];
  fingerprint?: string;
  comments: number;
  participants: number;
  attachments: number;
  knownBytes: number;
  unknownSizes: number;
  warnings: string[];
  error?: string;
}

export interface DestinationComment {
  id: string;
  pageId: string;
  body: string;
  version?: string;
  fingerprint: string;
  url?: string;
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
  reparentPages?: boolean;
  readComments?: boolean;
  writeComments?: boolean;
  updateComments?: boolean;
}

export interface SourceStatusExclusion {
  id: string;
  canonicalId?: string;
  locator: string;
  title?: string;
  url?: string;
  parentId?: string;
  ancestorIds?: string[];
  depth?: number;
  discoveredFromId?: string;
  metadataComplete?: boolean;
  reason: 'source-status';
  status?: string;
}

export interface DescendantDiscovery {
  pages: SourcePage[];
  returned: number;
  excluded: SourceStatusExclusion[];
  effectiveStatus: SourceStatus;
  notes: string[];
}

export interface SourceAdapter {
  readonly profile: ConnectionProfile;
  readonly kind: ProviderKind;
  readonly capabilities: AdapterCapabilities;
  preflight(): Promise<{product: string; version?: string; warnings: string[]}>;
  resolvePage(locator: string): Promise<SourcePage>;
  getPage(id: string): Promise<SourcePage>;
  supportsSourceStatus(scope: TransferScope, status: SourceStatus): boolean;
  getDescendants(page: SourcePage, options: {status: SourceStatus}): Promise<DescendantDiscovery>;
  resolveReference(from: SourcePage, reference: PageReference): Promise<SourcePage | undefined>;
  listResources(page: SourcePage): Promise<SourceResource[]>;
  readComments?(page: SourcePage): Promise<CommentInventory>;
  downloadResource(resource: SourceResource, destination: string): Promise<{path: string; size: number; sha256: string; mimeType?: string}>;
}

export interface DestinationAdapter {
  readonly profile: ConnectionProfile;
  readonly kind: ProviderKind;
  readonly capabilities: AdapterCapabilities;
  preflight(): Promise<{product: string; version?: string; warnings: string[]}>;
  resolveContainer(locator: string): Promise<DestinationContainer>;
  findChild(container: DestinationContainer | DestinationPage, title: string): Promise<DestinationPage | undefined>;
  findTitleConflict?(container: DestinationContainer | DestinationPage, title: string): Promise<DestinationPage | undefined>;
  findRecoverablePage?(container: DestinationContainer | DestinationPage, title: string): Promise<DestinationPage | undefined>;
  createPage(input: {container: DestinationContainer | DestinationPage; title: string; body: string}): Promise<DestinationPage>;
  updatePage(input: {page: DestinationPage; title: string; body: string; expectedFingerprint?: string}): Promise<DestinationPage>;
  reparentPage?(input: {
    page: DestinationPage;
    parent: DestinationContainer | DestinationPage;
    expectedFingerprint?: string;
  }): Promise<DestinationPage>;
  uploadResource(input: {
    page: DestinationPage;
    name: string;
    filePath: string;
    size?: number;
    mimeType?: string;
    existingId?: string;
  }): Promise<UploadedResource>;
  listUploadedResources(page: DestinationPage): Promise<UploadedResource[]>;
  downloadUploadedResource?(input: {page: DestinationPage; resource: UploadedResource; destination: string}): Promise<{path: string; size: number; sha256: string; mimeType?: string}>;
  verifyPage(page: DestinationPage): Promise<DestinationPage>;
  renderPageReference(page: DestinationPage, label: string, anchor?: string): string;
  renderResourceReference(resource: UploadedResource, label: string, image: boolean): string;
  findArchiveComment?(page: DestinationPage, fingerprint?: string): Promise<DestinationComment | undefined>;
  createArchiveComment?(input: {page: DestinationPage; body: string}): Promise<DestinationComment>;
  updateArchiveComment?(input: {comment: DestinationComment; body: string}): Promise<DestinationComment>;
  readArchiveComment?(input: {page: DestinationPage; commentId: string}): Promise<DestinationComment>;
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

export interface HierarchyGap {
  pageId: string;
  missingParentId?: string;
  selectedParentId: string;
  reason: 'unavailable' | 'source-status';
}

export interface SourceSelection {
  requestedStatus: SourceStatus;
  effectiveStatus: SourceStatus;
  returnedDescendants: number;
  selectedDescendants: number;
  excluded: SourceStatusExclusion[];
  maximumDepth: number;
  hierarchyGaps: HierarchyGap[];
  notes: string[];
}

export interface PageGraph {
  rootId: string;
  pages: DiscoveredPage[];
  edges: PageGraphEdge[];
  warnings: string[];
  selection: SourceSelection;
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
  type: 'document' | 'html' | 'layout' | 'layout-section' | 'layout-cell' | 'page-reference' | 'resource-reference' | 'vendor-extension' | 'fallback' | 'tree-directive';
  value?: string;
  children?: NormalizedNode[];
  reference?: NormalizedReference;
  vendor?: ProviderKind;
  tree?: {depth?: number; sort?: 'asc' | 'desc'; sortBy?: 'title'};
  layout?: {
    source: ProviderKind;
    gap?: string;
    sectionType?: 'single' | 'two_equal' | 'two_left_sidebar' | 'two_right_sidebar' | 'three_equal' | 'three_with_sidebars' | 'unsupported';
  };
}

export interface NormalizedDocument {
  root: NormalizedNode;
  raw: string;
  rawFormat: RawContentFormat;
  references: NormalizedReference[];
  warnings: string[];
  normalizations: string[];
  degraded: boolean;
  semanticallyEmpty: boolean;
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
  normalizations: string[];
  degraded: boolean;
  representedReferences: number;
}

export function assertTransferCapabilities(
  source: SourceAdapter,
  destination: DestinationAdapter | undefined,
  scope: TransferScope,
  sourceStatus: SourceStatus = 'all',
  comments = true,
): void {
  const missing: string[] = [];
  if (!source.capabilities.readPages) missing.push(`${source.profile.name}: read pages`);
  if (scope !== 'page' && !source.capabilities.readHierarchy) missing.push(`${source.profile.name}: read hierarchy`);
  if (!source.capabilities.readResources) missing.push(`${source.profile.name}: read resources`);
  if (destination && !destination.capabilities.writePages) missing.push(`${destination.profile.name}: write pages`);
  if (destination && !destination.capabilities.writeResources) missing.push(`${destination.profile.name}: write resources`);
  if (destination && !destination.capabilities.verifyWrites) missing.push(`${destination.profile.name}: verify writes`);
  if (comments && source.capabilities.readComments !== true) missing.push(`${source.profile.name}: read comments (or use --no-comments)`);
  if (missing.length > 0) throw new Error(`Selected direction lacks required capabilities: ${missing.join(', ')}.`);
  const supportsSourceStatus = source.supportsSourceStatus?.(scope, sourceStatus) ?? sourceStatus === 'all';
  if (!supportsSourceStatus) {
    throw new Error(`${source.profile.name} (${source.kind}) cannot determine --source-status ${sourceStatus} for --scope ${scope}. Use --source-status all or choose a supported scope.`);
  }
}

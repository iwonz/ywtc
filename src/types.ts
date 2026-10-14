import type {Readable} from 'node:stream';

export type YandexPageType = 'page' | 'grid' | 'wysiwyg' | 'template';

export interface YandexBreadcrumb {
  id?: number;
  slug: string;
  title: string;
  page_exists?: boolean;
}

export interface YandexPageDetails {
  id: number;
  slug: string;
  title: string;
  page_type: YandexPageType;
  content?: string;
  breadcrumbs?: YandexBreadcrumb[];
  redirect?: {
    page_id: number;
    redirect_target: {
      id: number;
      slug: string;
      title: string;
      page_type?: YandexPageType | null;
    };
  } | null;
  attributes?: {
    created_at?: string;
    modified_at?: string;
    lang?: string;
    is_readonly?: boolean;
    is_draft?: boolean;
  };
}

export interface YandexPageIdentity {
  id: number;
  slug: string;
}

export interface YandexAttachment {
  id: number;
  name: string;
  is_downloadable: boolean;
  download_url: string;
  size: string | number;
  description?: string;
  created_at?: string;
  mimetype?: string;
  has_preview?: boolean;
  check_status?: string;
}

export interface YandexGridColumn {
  id?: string;
  slug: string;
  title: string;
  type?: string;
  format?: 'yfm' | 'wom' | 'plain' | null;
  width?: number;
  width_units?: '%' | 'px' | null;
}

export interface YandexGridRow {
  id: string;
  row: unknown[];
  pinned?: boolean;
  color?: string;
}

export interface YandexGrid {
  id: string | number;
  title: string;
  page?: YandexPageIdentity;
  structure: {
    columns: YandexGridColumn[];
    default_sort?: unknown[];
  };
  rows: YandexGridRow[];
  rich_text_format?: 'yfm' | 'wom' | 'plain';
  revision?: string;
}

export interface YandexGridSummary {
  id: string;
  title: string;
  created_at?: string;
}

export interface DownloadedFile {
  path: string;
  size: number;
  sha256: string;
  mimeType?: string;
}

export interface ConfluencePage {
  id: string;
  type: 'page';
  status?: string;
  title: string;
  space: {
    key: string;
    id?: number | string;
    name?: string;
  };
  ancestors?: Array<{id: string}>;
  version?: {
    number: number;
  };
  body?: {
    storage?: {
      value: string;
      representation: string;
    };
    view?: {
      value: string;
      representation: string;
    };
  };
  operations?: Array<{
    operation: string;
    targetType: string;
  }>;
  _links?: {
    webui?: string;
    base?: string;
    self?: string;
  };
}

export interface ConfluenceAttachment {
  id: string;
  title: string;
  metadata?: {
    mediaType?: string;
  };
  extensions?: {
    fileSize?: number;
  };
}

export interface ConfluencePlatformInfo {
  deployment: 'data-center' | 'cloud';
  product: string;
  version?: string;
  api: string;
}

export interface PagePlan {
  source: YandexPageDetails;
  parentSourceId?: number;
  depth: number;
  destinationTitle: string;
  destinationId?: string;
}

export interface AttachmentPlan {
  source: YandexAttachment;
  destinationName: string;
}

export interface PageState {
  sourceId: number;
  sourceSlug: string;
  sourceTitle: string;
  parentSourceId?: number;
  destinationId: string;
  destinationTitle: string;
  status: 'created' | 'complete' | 'failed';
  lastError?: string;
  attachments: Record<string, AttachmentState>;
  updatedAt: string;
}

export interface AttachmentState {
  sourceId: number;
  sourceName: string;
  destinationId?: string;
  destinationName: string;
  sha256?: string;
  size?: number;
  status: 'complete' | 'failed';
  lastError?: string;
  updatedAt: string;
}

export interface MigrationState {
  version: 1;
  sourceRootSlug: string;
  targetPageId: string;
  spaceKey: string;
  startedAt: string;
  updatedAt: string;
  pages: Record<string, PageState>;
}

export interface MigrationPlanSummary {
  pages: number;
  descendants: number;
  pagesToCreate: number;
  pagesToUpdate: number;
  attachments: number;
  attachmentBytes: number;
  dynamicTables: number;
  dynamicTableRows: number;
  renamedPages: number;
  warnings: number;
  links: {
    internal: number;
    external: number;
    attachments: number;
    anchors: number;
  };
  images: {
    attached: number;
    external: number;
  };
  staticTables: number;
  codeBlocks: number;
}

export interface YandexWikiApi {
  getPageBySlug(slug: string): Promise<YandexPageDetails>;
  getPageById(id: number): Promise<YandexPageDetails>;
  getDescendants(id: number): Promise<YandexPageIdentity[]>;
  getAttachments(pageId: number): Promise<YandexAttachment[]>;
  getPageGrids(pageId: number): Promise<YandexGridSummary[]>;
  getGrid(id: string): Promise<YandexGrid>;
  download(pageId: number, attachmentId: number, destination: string): Promise<DownloadedFile>;
}

export interface ConfluenceApi {
  preflight?(): Promise<ConfluencePlatformInfo>;
  resolveTarget(input: string): Promise<ConfluencePage>;
  getPage(id: string): Promise<ConfluencePage>;
  findPageByTitle(spaceKey: string, title: string): Promise<ConfluencePage | undefined>;
  createPage(input: {
    spaceKey: string;
    parentId: string;
    title: string;
    storage: string;
  }): Promise<ConfluencePage>;
  updatePage(input: {
    pageId: string;
    title: string;
    storage: string;
  }): Promise<ConfluencePage>;
  findAttachment(pageId: string, filename: string): Promise<ConfluenceAttachment | undefined>;
  uploadAttachment(input: {
    pageId: string;
    filename: string;
    file: Readable;
    contentLength?: number;
    mimeType?: string;
    existingAttachmentId?: string;
  }): Promise<ConfluenceAttachment>;
  listAttachments(pageId: string): Promise<ConfluenceAttachment[]>;
  pageWebUrl(page: ConfluencePage): string;
}

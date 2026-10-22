import type {GraphEdgeStatus, MentionMode, MentionOutcome, MentionOutcomeCounts, ProviderKind, SourceResource, SourceSelection, SourceStatus, TransferScope} from './domain.js';
import type {IssueCategory, IssueObjectType, MigrationIssue} from './issues.js';
import type {CommentTransferStatus, PageTransferStatus, ResourceTransferState, RunStatus, StateLoadSource} from './state.js';
import type {ConflictEvidence} from './state.js';

export type ReportInventoryStatus = 'pending' | 'complete' | 'failed';
export type ReportResourceStatus = ResourceTransferState['status'];
export type ReportPresentationStatus = PageTransferStatus | 'excluded';

export interface TransferReportResource {
  sourceId: string;
  sourceName: string;
  sourceUrl?: string;
  sourceReference?: string;
  kind: SourceResource['kind'] | 'comment-attachment';
  status: ReportResourceStatus;
  sourceBytes?: number;
  transferredBytes?: number;
  sha256?: string;
  destinationId?: string;
  destinationName?: string;
  destinationUrl?: string;
  error?: string;
  blockedByPageId?: string;
  blockedByCode?: string;
  blockedReason?: string;
  attemptedInRun?: boolean;
  outcomeRunId?: string;
}

export interface TransferReportCommentItem {
  threadId: string;
  commentId: string;
  parentId?: string;
  author: string;
  createdAt?: string;
  sourceStatus?: string;
  outcome: CommentTransferStatus;
  sourceUrl?: string;
  destinationUrl?: string;
  error?: string;
}

export interface TransferReportMention {
  id: string;
  location: 'page' | 'comment';
  source: string;
  sourceIdentity?: {username?: string; userKey?: string; accountId?: string; id?: string};
  outcome: MentionOutcome;
  label: string;
  url?: string;
  destinationIdentity?: {username?: string; userKey?: string; accountId?: string; id?: string};
  reason?: string;
  retryable: boolean;
}

export interface TransferReportPage {
  sourceCanonicalId: string;
  sourceId: string;
  sourceTitle: string;
  sourceUrl: string;
  sourceParentId?: string;
  sourceAncestorIds?: string[];
  destinationId?: string;
  destinationTitle?: string;
  destinationUrl?: string;
  destinationParentId?: string;
  /** Projected report parent. Kept as an alias while state uses projectedParentId. */
  parentId?: string;
  projectedParentId?: string;
  depth: number;
  status: PageTransferStatus;
  inventoryStatus: ReportInventoryStatus;
  resources: number;
  resourceItems: TransferReportResource[];
  sourceBytes?: number;
  transferredBytes: number;
  bytesUnknown: number;
  links: number;
  images: number;
  tables: number;
  grids: number;
  codeBlocks: number;
  diagrams?: number;
  degraded: boolean;
  resourceFallbacks: Array<{name: string; error: string}>;
  warnings: string[];
  normalizations?: string[];
  adaptations?: string[];
  preservedExternalReferences?: number;
  mentions?: TransferReportMention[];
  conflictEvidence?: ConflictEvidence;
  error?: string;
  blockedByPageId?: string;
  blockedByCode?: string;
  blockedReason?: string;
  attemptedInRun?: boolean;
  outcomeRunId?: string;
  comments: {
    status: CommentTransferStatus;
    threads: number;
    comments: number;
    participants: number;
    attachments: number;
    bytes: number;
    archiveName?: string;
    archiveUrl?: string;
    destinationId?: string;
    destinationUrl?: string;
    revision?: boolean;
    stale?: boolean;
    error?: string;
    preview?: string;
    items?: TransferReportCommentItem[];
    blockedByPageId?: string;
    blockedByCode?: string;
    blockedReason?: string;
    attemptedInRun?: boolean;
    outcomeRunId?: string;
  };
}

export interface TransferInvocation {
  source: {locator: string; profile: string};
  destination:
    | {type: 'remote'; locator: string; profile: string}
    | {type: 'directory'; path: string; format: 'markdown' | 'html'};
  scope: TransferScope;
  sourceStatus: SourceStatus;
  comments: boolean;
  archive: boolean;
  state: {mode: 'automatic' | 'explicit'; path: string};
}

interface TransferRetryMetadata {
  rootRunId: string;
  parentRunId: string;
  attempt: number;
  selectedPages: number;
  selectedResources: number;
  selectedComments: number;
  contextPages: number;
  carriedForward: number;
  remainingRetryable: number;
  remainingTerminal: number;
  preview: boolean;
}

export interface TransferReportExcludedPage {
  sourceCanonicalId: string;
  sourceId: string;
  sourceTitle: string;
  sourceUrl?: string;
  sourceParentId?: string;
  sourceAncestorIds?: string[];
  projectedParentId?: string;
  discoveredFromId?: string;
  depth?: number;
  status: 'excluded';
  sourceStatus?: string;
  reason: string;
  metadataComplete: boolean;
}

export interface TransferReportEdge {
  from: string;
  raw: string;
  to?: string;
  status: GraphEdgeStatus;
  message?: string;
}

export interface TransferReportIssue extends MigrationIssue {
  category: IssueCategory;
  objectType: IssueObjectType;
  objectId?: string;
  pageTitle?: string;
  pageAnchor?: string;
  resourceName?: string;
  commentLabel?: string;
  action: string;
}

type PageStatusCounts = Record<PageTransferStatus, number>;
type ResourceStatusCounts = Record<ReportResourceStatus, number>;
type EdgeStatusCounts = Record<GraphEdgeStatus, number>;
type CommentStatusCounts = Record<CommentTransferStatus, number>;

export interface TransferReportSummary {
  pages: number;
  returnedDescendants: number;
  selectedDescendants: number;
  excludedPages: number;
  maximumDepth: number;
  hierarchyGaps: number;
  hierarchyRepairs: number;
  complete: number;
  partial: number;
  failed: number;
  blocked: number;
  conflicts: number;
  notStartedPages: number;
  unprocessedPages: number;
  resources: number;
  attachments: number;
  resourceImages: number;
  resourceDiagrams?: number;
  resourcesComplete: number;
  resourcesPartial: number;
  resourcesFailed: number;
  resourcesBlocked: number;
  resourcesNotStarted: number;
  resourcesPlanned: number;
  bytes: number;
  sourceBytes: number;
  bytesUnknown: number;
  links: number;
  images: number;
  tables: number;
  grids: number;
  gridsComplete?: number;
  gridsFailed?: number;
  gridStatuses?: ResourceStatusCounts;
  codeBlocks: number;
  diagrams?: number;
  cycles: number;
  normalizations: number;
  adaptations: number;
  preservedExternalReferences: number;
  degradations: number;
  warnings: number;
  errors: number;
  rootErrors: number;
  dependentPages: number;
  dependentFiles: number;
  dependentComments: number;
  retryableFailures: number;
  recoveredIssues?: number;
  inventoryComplete: boolean;
  inventoriedPages: number;
  inventoryFailedPages: number;
  inventoryReusedPages?: number;
  inventoryFreshPages?: number;
  inventoryPendingPages?: number;
  inventoryRecoveryAttempts?: number;
  inventoryRemainingFailures?: number;
  commentThreads: number;
  comments: number;
  commentParticipants: number;
  commentAttachments: number;
  commentBytes: number;
  commentStatuses: CommentStatusCounts;
  mentionMode?: MentionMode;
  pageMentions?: number;
  commentMentions?: number;
  mentionIdentities?: number;
  mentionOutcomes?: MentionOutcomeCounts;
  durationMs?: number;
  pageStatuses: PageStatusCounts;
  resourceStatuses: ResourceStatusCounts;
  traversalStatuses: EdgeStatusCounts;
}

export interface TransferReportData {
  runId: string;
  startedAt: string;
  finishedAt?: string;
  status: RunStatus;
  dryRun: boolean;
  commentsEnabled: boolean;
  mentionMode?: MentionMode;
  scope: TransferScope;
  sourceStatus: SourceStatus;
  selection: SourceSelection;
  direction: string;
  source: {provider: ProviderKind; profile: string; rootId: string; title: string; url: string};
  destination: {provider: ProviderKind | 'filesystem'; profile?: string; id: string; url?: string; format?: string};
  invocation?: TransferInvocation;
  retry?: TransferRetryMetadata;
  state: {id: string; path: string; mode: 'automatic' | 'explicit'; source: StateLoadSource; backupPath?: string};
  pages: TransferReportPage[];
  excludedPages: TransferReportExcludedPage[];
  edges: TransferReportEdge[];
  hierarchyRepairs: Array<{
    sourceCanonicalId: string;
    mode: 'moved' | 'recreated';
    oldParentId?: string;
    newParentId: string;
    oldDestinationId: string;
    newDestinationId: string;
    verified: boolean;
  }>;
  warnings: string[];
  errors: string[];
  issues: TransferReportIssue[];
  outputs: Array<{label: string; value: string}>;
  summary: TransferReportSummary;
}

export interface MigrationReportPaths {
  runId: string;
  directory: string;
  html: string;
  json: string;
}

export interface PreviewPair {
  source: string;
  destination: string;
}

export interface ReportPresentationPayload {
  report: TransferReportData;
  previews: Record<string, PreviewPair>;
}

export const pageStatuses: PageTransferStatus[] = [
  'discovered',
  'planned',
  'skeleton-created',
  'not-started',
  'complete',
  'partial',
  'conflict',
  'failed',
  'blocked',
];
export const resourceStatuses: ReportResourceStatus[] = ['planned', 'not-started', 'blocked', 'complete', 'partial', 'failed'];
export const edgeStatuses: GraphEdgeStatus[] = ['resolved', 'external', 'inaccessible', 'broken', 'cycle', 'unsupported'];
export const commentStatuses: CommentTransferStatus[] = ['planned', 'not-started', 'blocked', 'complete', 'partial', 'failed', 'conflict', 'stale', 'skipped'];

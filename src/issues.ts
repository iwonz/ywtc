import {stripAnsi} from './content-model.js';

export type IssueSeverity = 'normalization' | 'adaptation' | 'degradation' | 'warning' | 'blocked' | 'error';
type IssueLifecycle = 'active' | 'resolved';
type IssuePhase = 'discovery' | 'inventory' | 'page' | 'resource' | 'comment' | 'verification' | 'report';
export type IssueCategory =
  | 'network'
  | 'rate-limit'
  | 'authorization'
  | 'permissions'
  | 'provider-api'
  | 'parsing'
  | 'rendering-layout'
  | 'verification'
  | 'hierarchy'
  | 'conflict'
  | 'attachment-image'
  | 'comment'
  | 'mention'
  | 'filtering'
  | 'dependency'
  | 'unknown';
export type IssueObjectType = 'run' | 'page' | 'resource' | 'comment' | 'mention';

export interface MigrationIssue {
  code: string;
  severity: IssueSeverity;
  phase: IssuePhase;
  category?: IssueCategory;
  objectType?: IssueObjectType;
  objectId?: string;
  message: string;
  pageId?: string;
  resourceId?: string;
  commentId?: string;
  rootCauseId?: string;
  blockedByPageId?: string;
  blockedByCode?: string;
  retryable: boolean;
  occurrences: number;
  lifecycle?: IssueLifecycle;
}

export type IssueInput = Omit<MigrationIssue, 'message' | 'occurrences'> & {message: string};

function normalizedMessage(message: string): string {
  return stripAnsi(message).replace(/\s+/g, ' ').trim();
}

export class IssueCollector {
  private readonly values = new Map<string, MigrationIssue>();

  add(input: IssueInput): MigrationIssue {
    const message = normalizedMessage(input.message);
    const key = [
      input.code,
      input.severity,
      input.phase,
      input.pageId ?? '',
      input.resourceId ?? '',
      input.commentId ?? '',
      input.objectId ?? '',
    ].join('\0');
    const previous = this.values.get(key);
    if (previous) {
      previous.occurrences += 1;
      if (message && previous.message !== message) previous.message = message;
      return previous;
    }
    const issue: MigrationIssue = {...input, message, lifecycle: input.lifecycle ?? 'active', occurrences: 1};
    this.values.set(key, issue);
    return issue;
  }

  list(): MigrationIssue[] {
    return [...this.values.values()];
  }

  count(severity: IssueSeverity): number {
    return this.list().filter((issue) => issue.lifecycle !== 'resolved' && issue.severity === severity).length;
  }

  countRetryableFailures(): number {
    return this.list().filter((issue) => issue.lifecycle !== 'resolved' && issue.retryable && (issue.severity === 'warning' || issue.severity === 'error')).length;
  }

  countResolved(): number {
    return this.list().filter((issue) => issue.lifecycle === 'resolved').length;
  }

  resolve(input: {pageId?: string; resourceId?: string; commentId?: string; codes: readonly string[]}): void {
    const codes = new Set(input.codes);
    for (const issue of this.values.values()) {
      if (!codes.has(issue.code)) continue;
      if (input.pageId !== undefined && issue.pageId !== input.pageId) continue;
      if (input.resourceId !== undefined && issue.resourceId !== input.resourceId) continue;
      if (input.commentId !== undefined && issue.commentId !== input.commentId) continue;
      issue.lifecycle = 'resolved';
      issue.retryable = false;
    }
  }
}

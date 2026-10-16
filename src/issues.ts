import {stripAnsi} from './content-model.js';

export type IssueSeverity = 'normalization' | 'degradation' | 'warning' | 'blocked' | 'error';
type IssuePhase = 'discovery' | 'inventory' | 'page' | 'resource' | 'comment' | 'verification' | 'report';

export interface MigrationIssue {
  code: string;
  severity: IssueSeverity;
  phase: IssuePhase;
  message: string;
  pageId?: string;
  resourceId?: string;
  blockedByPageId?: string;
  blockedByCode?: string;
  retryable: boolean;
  occurrences: number;
}

export type IssueInput = Omit<MigrationIssue, 'message' | 'occurrences'> & {message: string};

function normalizedMessage(message: string): string {
  return stripAnsi(message).replace(/\s+/g, ' ').trim();
}

export class IssueCollector {
  private readonly values = new Map<string, MigrationIssue>();

  add(input: IssueInput): MigrationIssue {
    const message = normalizedMessage(input.message);
    const key = [input.code, input.severity, input.phase, input.pageId ?? '', input.resourceId ?? ''].join('\0');
    const previous = this.values.get(key);
    if (previous) {
      previous.occurrences += 1;
      if (message && previous.message !== message) previous.message = message;
      return previous;
    }
    const issue: MigrationIssue = {...input, message, occurrences: 1};
    this.values.set(key, issue);
    return issue;
  }

  list(): MigrationIssue[] {
    return [...this.values.values()];
  }

  count(severity: IssueSeverity): number {
    return this.list().filter((issue) => issue.severity === severity).length;
  }

  countRetryableFailures(): number {
    return this.list().filter((issue) => issue.retryable && (issue.severity === 'warning' || issue.severity === 'error')).length;
  }
}

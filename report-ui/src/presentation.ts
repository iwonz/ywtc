import type {TransferReportData, TransferReportPage} from '../../src/report-contract.js';

export type SummarySection = 'pages' | 'files' | 'comments' | 'mentions' | 'data' | 'quality';
export type DetailSection = 'overview' | 'files' | 'comments' | 'mentions' | 'comparison' | 'issues';

export function positiveCounts(counts: Record<string, number>): Array<[status: string, count: number]> {
  return Object.entries(counts).filter(([, count]) => count > 0);
}

export function visibleSummarySections(summary: TransferReportData['summary']): SummarySection[] {
  const sections: SummarySection[] = ['pages'];
  if (summary.resources > 0 || summary.commentAttachments > 0) sections.push('files');
  const commentProblem = positiveCounts(summary.commentStatuses).some(([status]) => !['complete', 'skipped'].includes(status));
  if (summary.commentThreads > 0 || summary.comments > 0 || summary.commentParticipants > 0 || summary.commentAttachments > 0 || commentProblem) {
    sections.push('comments');
  }
  if ((summary.mentionOutcomes?.total ?? 0) > 0) sections.push('mentions');
  if (summary.sourceBytes + summary.commentBytes > 0 || summary.bytes > 0 || summary.bytesUnknown > 0) sections.push('data');
  if (summary.normalizations > 0 || summary.adaptations > 0 || summary.preservedExternalReferences > 0
    || summary.errors > 0 || summary.warnings > 0 || summary.degradations > 0) {
    sections.push('quality');
  }
  return sections;
}

export function visibleDetailSections(input: {
  page?: TransferReportPage | undefined;
  hasPreview: boolean;
  issueCount: number;
}): DetailSection[] {
  const sections: DetailSection[] = ['overview'];
  if (input.page?.resourceItems.length) sections.push('files');
  const comments = input.page?.comments;
  if (comments && (comments.comments > 0 || comments.threads > 0 || comments.attachments > 0
    || comments.error || comments.archiveName || comments.items?.length || !['complete', 'skipped'].includes(comments.status))) {
    sections.push('comments');
  }
  if (input.page?.mentions?.length) sections.push('mentions');
  if (input.hasPreview) sections.push('comparison');
  if (input.issueCount > 0) sections.push('issues');
  return sections;
}

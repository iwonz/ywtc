import {describe, expect, it} from 'vitest';
import type {TransferReportData, TransferReportPage} from '../src/report-contract.js';
import {targetSelectionSchema} from '../src/jobs/contracts.js';

function baseline(): TransferReportData {
  const page = (id: string, status: string, parentId?: string) => ({sourceCanonicalId: id, sourceId: id, sourceTitle: id, sourceUrl: `https://wiki.example.com/${id}`, status, depth: parentId ? 1 : 0, projectedParentId: parentId,
    resourceItems: id === 'child' ? [{sourceId: 'file', sourceName: 'file.png', status: 'failed'}] : [], comments: {status: 'failed'}, inventoryStatus: 'complete', destinationId: `dest-${id}`,
  }) as TransferReportPage;
  return {pages: [page('root', 'complete'), page('child', 'partial', 'root'), page('foreign', 'conflict')], issues: [{pageId: 'child', resourceId: 'file', code: 'resource-transfer-failed', severity: 'error', phase: 'resource', objectType: 'resource', retryable: false, category: 'permissions'}], summary: {inventoryComplete: true}, sourceStatus: 'all'} as unknown as TransferReportData;
}
describe('preview-bound operator selection', () => {
  it('keeps resource-only work and ancestors distinct and requires terminal confirmation', async () => {
    const {buildOperatorPlan} = await import('../src/targeted-operations.js'), report = baseline();
    const selection = targetSelectionSchema.parse({resourceIds: {child: ['file']}});
    expect(() => buildOperatorPlan(report, selection, 'retry')).toThrow(/terminal|confirmation/);
    const plan = buildOperatorPlan(report, {...selection, terminalOverride: true}, 'retry');
    expect(plan.retryPageIds).toEqual(['child']);expect(plan.contextPageIds).toEqual(['root']);
    expect(plan.pages.child).toMatchObject({retryPage: false, resourceIds: ['file'], retryComments: false});
    expect(() => buildOperatorPlan(report, targetSelectionSchema.parse({pageIds: ['foreign'], terminalOverride: true}), 'retry')).toThrow(/ownership|identity/);
    expect(() => buildOperatorPlan(report, targetSelectionSchema.parse({resourceIds: {child: ['unknown']}, terminalOverride: true}), 'retry')).toThrow(/resource/);
  });
  it('allows decisions on complete pages and detects stale immutable preview evidence', async () => {
    const {buildOperatorPlan, assertPreviewEvidence} = await import('../src/targeted-operations.js'), report = baseline();
    const plan = buildOperatorPlan(report, targetSelectionSchema.parse({pageIds: ['root']}), 'decisions');
    expect(plan.retryPageIds).toEqual(['root']);
    expect(() => assertPreviewEvidence({source: 'a', destination: 'b'}, {source: 'a', destination: 'changed'})).toThrow(/preview|Preview/);
    expect(() => assertPreviewEvidence({source: 'a'}, {source: 'a'})).not.toThrow();
  });
});

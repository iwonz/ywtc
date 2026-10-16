import {access, mkdtemp} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {expect, test} from '@playwright/test';
import {TransferReport, type TransferReportPage} from '../../src/report.js';

function reportPage(input: Partial<TransferReportPage> & Pick<TransferReportPage, 'sourceCanonicalId' | 'sourceId' | 'sourceTitle' | 'status'>): TransferReportPage {
  return {
    sourceUrl: `https://wiki.example.com/${input.sourceId}`,
    depth: 0,
    inventoryStatus: 'complete',
    resources: 0,
    resourceItems: [],
    sourceBytes: 0,
    transferredBytes: 0,
    bytesUnknown: 0,
    links: 0,
    images: 0,
    tables: 0,
    grids: 0,
    codeBlocks: 0,
    degraded: false,
    resourceFallbacks: [],
    warnings: [],
    normalizations: [],
    comments: {status: 'complete', threads: 0, comments: 0, participants: 0, attachments: 0, bytes: 0},
    ...input,
  };
}

let reportUrl: string;

test.beforeAll(async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'ywtc-report-browser-'));
  const report = new TransferReport({
    dryRun: false,
    scope: 'subtree',
    direction: 'yandex-wiki → confluence',
    source: {provider: 'yandex-wiki', profile: 'wiki', rootId: '1', title: 'Knowledge base', url: 'https://wiki.example.com/root'},
    destination: {provider: 'confluence', profile: 'docs', id: '10', url: 'https://docs.example.com/pages/10'},
    state: {id: 'state-id', path: '/tmp/state.json', mode: 'automatic', source: 'existing'},
  });
  report.addPage(reportPage({
    sourceCanonicalId: 'wiki:1', sourceId: '1', sourceTitle: 'Knowledge base', status: 'complete', links: 4, images: 1, tables: 1,
    resources: 1, sourceBytes: 8, transferredBytes: 8,
    resourceItems: [{sourceId: 'logo', sourceName: 'logo.png', kind: 'image', status: 'complete', sourceBytes: 8, transferredBytes: 8, destinationName: 'logo.png'}],
    comments: {status: 'complete', threads: 1, comments: 2, participants: 2, attachments: 1, bytes: 128, archiveName: 'comments.zip', destinationId: 'comment-1', preview: 'Архив комментариев из оригинала'},
  }), {source: '<h1>Knowledge base</h1><p>Source text</p>', destination: '<h1>Knowledge base</h1><p>Destination text</p>'});
  report.addPage(reportPage({
    sourceCanonicalId: 'wiki:2', sourceId: '2', sourceTitle: 'Partial child', status: 'partial', depth: 1, parentId: 'wiki:1', degraded: true,
    resources: 1, sourceBytes: 12, transferredBytes: 0,
    resourceItems: [{sourceId: 'manual', sourceName: 'manual.pdf', kind: 'attachment', status: 'failed', sourceBytes: 12, destinationName: 'manual.pdf', error: 'upload rejected'}],
    resourceFallbacks: [{name: 'manual.pdf', error: 'upload rejected'}],
  }), {source: '<p>Manual source</p>', destination: '<p>Manual source with fallback</p>'});
  report.issue({code: 'resource-transfer-failed', severity: 'error', phase: 'resource', pageId: 'wiki:2', resourceId: 'manual', retryable: true, message: 'Attachment upload was rejected'});
  report.finish('partial');
  reportUrl = pathToFileURL((await report.write(temporary)).html).toString();
});

for (const viewport of [{name: 'desktop', width: 1440, height: 900}, {name: 'mobile', width: 390, height: 844}]) {
  test(`${viewport.name}: report explains source totals, outcomes, and affected problems`, async ({page}) => {
    await page.setViewportSize({width: viewport.width, height: viewport.height});
    await page.goto(reportUrl);

    await expect(page.getByRole('heading', {name: 'Source scope inventory'})).toBeVisible();
    await expect(page.getByRole('heading', {name: 'Transfer outcomes'})).toBeVisible();
    await expect(page.getByRole('heading', {name: 'Needs attention'})).toBeVisible();
    await expect(page.getByText('accessible in selected scope')).toBeVisible();
    await expect(page.getByText('1 threads').first()).toBeVisible();
    const rootDetails = page.locator('details.page').filter({hasText: 'Knowledge base'});
    await rootDetails.locator(':scope > summary').click();
    await expect(rootDetails.getByText('comments.zip')).toBeVisible();
    await expect(rootDetails.getByText('Destination archive preview')).toBeVisible();
    const attention = page.locator('.attention');
    await expect(attention.getByText('Attachment upload was rejected')).toBeVisible();
    await expect(attention.getByText('resource manual.pdf')).toBeVisible();

    await page.getByRole('link', {name: 'Partial child'}).first().click();
    await expect(page.locator('details:target')).toContainText('manual.pdf');
    await expect(page.locator('details:target')).toHaveAttribute('open', '');

    const download = page.getByRole('link', {name: 'Download report JSON'});
    const href = await download.getAttribute('href');
    expect(href).toBe('report.json');
    await access(fileURLToPath(new URL(href!, page.url()).toString()));

    if (viewport.name === 'mobile') {
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
  });
}

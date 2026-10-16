import {access, mkdtemp} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {expect, test} from '@playwright/test';
import {TransferReport, type TransferReportPage} from '../../src/report.js';

function reportPage(input: Partial<TransferReportPage> & Pick<TransferReportPage, 'sourceCanonicalId' | 'sourceId' | 'sourceTitle' | 'status'>): TransferReportPage {
  return {
    sourceUrl: `https://wiki.example.com/${input.sourceId}`, depth: 0, inventoryStatus: 'complete', resources: 0,
    resourceItems: [], sourceBytes: 0, transferredBytes: 0, bytesUnknown: 0, links: 0, images: 0, tables: 0,
    grids: 0, codeBlocks: 0, degraded: false, resourceFallbacks: [], warnings: [], normalizations: [],
    comments: {status: 'complete', threads: 0, comments: 0, participants: 0, attachments: 0, bytes: 0}, ...input,
  };
}

let reportUrl: string;

test.beforeAll(async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'ywtc-report-browser-'));
  const report = new TransferReport({
    dryRun: false, scope: 'subtree', sourceStatus: 'current', direction: 'yandex-wiki → confluence',
    source: {provider: 'yandex-wiki', profile: 'wiki', rootId: '1', title: 'Knowledge base', url: 'https://wiki.example.com/root'},
    destination: {provider: 'confluence', profile: 'docs', id: '10', url: 'https://docs.example.com/pages/10'},
    state: {id: 'state-id', path: '/tmp/state.json', mode: 'automatic', source: 'existing'},
  });
  report.setSelection({
    requestedStatus: 'current', effectiveStatus: 'current', returnedDescendants: 4, selectedDescendants: 3,
    excluded: [{
      id: '5', canonicalId: 'wiki:5', locator: 'root/obsolete', title: 'Obsolete notes',
      url: 'https://wiki.example.com/root/obsolete', parentId: '1', ancestorIds: ['1'], depth: 1,
      reason: 'source-status', status: 'obsolete', metadataComplete: true,
    }],
    maximumDepth: 2, hierarchyGaps: [], notes: [],
  });
  report.addPage(reportPage({
    sourceCanonicalId: 'wiki:1', sourceId: '1', sourceTitle: 'Knowledge base', status: 'complete', links: 4, images: 1, tables: 1,
    destinationId: '11', destinationTitle: 'Knowledge base', destinationUrl: 'https://docs.example.com/pages/11',
    resources: 1, sourceBytes: 8, transferredBytes: 8,
    resourceItems: [{
      sourceId: 'logo', sourceName: 'logo.png', kind: 'image', status: 'complete', sourceBytes: 8, transferredBytes: 8,
      sha256: '0'.repeat(64), sourceUrl: 'https://wiki.example.com/download/logo.png', destinationName: 'logo.png',
      destinationUrl: 'https://docs.example.com/download/logo.png',
    }],
    comments: {
      status: 'complete', threads: 1, comments: 2, participants: 2, attachments: 1, bytes: 128,
      archiveName: 'comments.zip', archiveUrl: 'https://docs.example.com/download/comments.zip', destinationId: 'comment-1',
      destinationUrl: 'https://docs.example.com/comments/1', preview: 'Архив комментариев из оригинала',
      items: [{
        threadId: 'thread-1', commentId: 'comment-entry-1', author: 'Example User', createdAt: '2026-10-16T12:00:00Z',
        sourceStatus: 'resolved', outcome: 'complete', sourceUrl: 'https://wiki.example.com/root#comment-comment-entry-1',
        destinationUrl: 'https://docs.example.com/comments/1',
      }],
    },
  }), {
    source: '<h1>Knowledge base</h1><section class="ywtc-layout"><section class="ywtc-layout-section ywtc-layout-columns-2"><div class="ywtc-layout-cell"><p>Source left</p></div><div class="ywtc-layout-cell"><p>Source right</p></div></section></section>',
    destination: '<h1>Knowledge base</h1><section class="ywtc-layout"><section class="ywtc-layout-section ywtc-layout-columns-2"><div class="ywtc-layout-cell"><p>Destination left</p></div><div class="ywtc-layout-cell"><p>Destination right</p></div></section></section><script>top.ywtcInjected=true</script>',
  });
  report.addPage(reportPage({
    sourceCanonicalId: 'wiki:2', sourceId: '2', sourceTitle: 'Partial child', status: 'partial', depth: 1,
    sourceParentId: '1', parentId: 'wiki:1', projectedParentId: 'wiki:1', destinationParentId: '11', degraded: true,
    resources: 1, sourceBytes: 12, transferredBytes: 0,
    resourceItems: [{sourceId: 'manual', sourceName: 'manual.pdf', kind: 'attachment', status: 'failed', sourceBytes: 12, sourceUrl: 'https://wiki.example.com/download/manual.pdf', destinationName: 'manual.pdf', error: 'upload rejected'}],
    resourceFallbacks: [{name: 'manual.pdf', error: 'upload rejected'}],
  }), {source: '<p>Manual source</p>', destination: '<p>Manual source with fallback</p>'});
  report.addPage(reportPage({sourceCanonicalId: 'wiki:3', sourceId: '3', sourceTitle: 'Occupied parent', status: 'failed', depth: 1, parentId: 'wiki:1', projectedParentId: 'wiki:1', error: 'All deterministic destination titles are occupied'}));
  report.addPage(reportPage({
    sourceCanonicalId: 'wiki:4', sourceId: '4', sourceTitle: 'Blocked child', status: 'blocked', depth: 2,
    parentId: 'wiki:3', projectedParentId: 'wiki:3', blockedByPageId: 'wiki:3', blockedByCode: 'destination-page-staging-failed', blockedReason: 'Destination parent is unavailable',
  }));
  report.issue({code: 'resource-transfer-failed', severity: 'error', phase: 'resource', pageId: 'wiki:2', resourceId: 'manual', retryable: true, message: 'Attachment upload was rejected'});
  report.issue({code: 'destination-page-staging-failed', severity: 'error', phase: 'page', pageId: 'wiki:3', retryable: true, message: 'All deterministic destination titles are occupied'});
  report.issue({code: 'destination-parent-unavailable', severity: 'blocked', phase: 'page', pageId: 'wiki:4', retryable: false, blockedByPageId: 'wiki:3', blockedByCode: 'destination-page-staging-failed', message: 'Destination parent is unavailable'});
  report.finish('partial');
  reportUrl = pathToFileURL((await report.write(temporary)).html).toString();
});

test('interactive report works offline through file:// with exact details and keyboard access', async ({page}) => {
  await page.setViewportSize({width: 1440, height: 900});
  const remoteRequests: string[] = [];
  const runtimeErrors: string[] = [];
  page.on('request', (request) => { if (/^https?:/i.test(request.url())) remoteRequests.push(request.url()); });
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  await page.goto(reportUrl);

  await expect(page.getByRole('heading', {name: 'Transfer report'})).toHaveClass(/visually-hidden/);
  await expect(page.getByRole('heading', {name: 'Page hierarchy'})).toBeVisible();
  await expect(page.getByRole('heading', {name: 'Summary'})).toHaveCount(0);
  await expect(page.getByRole('heading', {name: 'Root causes'})).toHaveCount(0);
  await expect(page.getByRole('heading', {name: 'Outputs'})).toHaveCount(0);
  await expect(page.getByText('Generated locally by ywtc. No report data is sent anywhere.')).toHaveCount(0);
  await expect(page.getByRole('columnheader', {name: 'Metric'})).toHaveCount(0);
  await expect(page.getByRole('progressbar')).toHaveCount(0);
  await expect(page.getByRole('link', {name: 'Open result'})).toHaveCount(0);
  await expect(page.getByText('Run ID', {exact: true})).toHaveCount(1);
  const metadataLabels = await page.locator('.run-detail dt').allTextContents();
  expect(metadataLabels).toEqual(['Run ID', 'State', 'Source', 'Destination']);
  const overview = page.locator('.overview-section');
  await expect(overview.getByRole('link', {name: 'https://wiki.example.com/root'})).toHaveAttribute('href', 'https://wiki.example.com/root');
  await expect(overview.getByRole('link', {name: 'https://docs.example.com/pages/10'})).toHaveAttribute('href', 'https://docs.example.com/pages/10');
  await expect(page.locator('main .mantine-Card-root, main .mantine-Paper-root')).toHaveCount(0);
  await expect(page.getByText('Quality', {exact: true})).toBeVisible();
  await expect(page.getByText(/0 unknown sizes/i)).toHaveCount(0);
  await expect(page.getByText(/0 safe normalization/i)).toHaveCount(0);
  await expect(page.getByText('Obsolete notes')).toBeVisible();
  await expect(page.getByText('Blocked child', {exact: true})).toBeVisible();
  expect(await page.evaluate(() => (globalThis as {ywtcInjected?: boolean}).ywtcInjected)).toBeUndefined();

  const root = page.getByRole('treeitem').filter({hasText: 'Knowledge base'});
  await root.getByRole('button', {name: 'Collapse branch'}).click();
  await expect(page.getByRole('treeitem').filter({hasText: 'Partial child'})).toHaveCount(0);
  await root.getByRole('button', {name: 'Expand branch'}).click();

  const partial = page.getByRole('treeitem').filter({hasText: 'Partial child'});
  await partial.focus();
  await partial.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('tab', {name: 'Files'}).click();
  await expect(page.getByRole('dialog').getByText('manual.pdf')).toBeVisible();
  await expect(page.getByRole('dialog').getByText('upload rejected')).toBeVisible();
  await page.getByRole('tab', {name: /Issues/}).click();
  await page.getByRole('dialog').getByRole('button', {name: 'Technical diagnostics'}).click();
  await expect(page.getByRole('dialog').getByText('Attachment upload was rejected')).toBeVisible();
  expect(await page.evaluate(() => document.querySelector('[role="dialog"]')?.contains(document.activeElement))).toBe(true);
  await page.getByRole('tab', {name: 'Comparison'}).click();
  await expect(page.getByRole('dialog').locator('iframe')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await root.getByRole('button', {name: 'View details'}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('tab', {name: 'Comparison'}).click();
  const sourceFrame = page.getByRole('dialog').locator('iframe').first().contentFrame();
  await expect(sourceFrame.locator('.ywtc-layout-cell')).toHaveCount(2);
  expect(await sourceFrame.locator('.ywtc-layout-section').evaluate((element) => getComputedStyle(element).display)).toBe('grid');
  await page.keyboard.press('Escape');

  await page.getByPlaceholder('Search pages, files, IDs, or diagnostics…').fill('manual.pdf');
  await expect(page.getByRole('treeitem').filter({hasText: 'Knowledge base'})).toBeVisible();
  await expect(page.getByRole('treeitem').filter({hasText: 'Partial child'})).toBeVisible();
  await expect(page.getByRole('treeitem').filter({hasText: 'Occupied parent'})).toHaveCount(0);
  expect(await page.getByRole('treeitem').filter({hasText: 'Partial child'}).getByRole('link', {name: 'Open source'}).getAttribute('href')).toBe('https://wiki.example.com/2');
  expect(await page.getByRole('link', {name: 'Download report JSON'}).getAttribute('href')).toBe('report.json');
  await access(fileURLToPath(new URL('report.json', page.url())));
  expect(remoteRequests).toEqual([]);
  expect(runtimeErrors).toEqual([]);
});

test('language, theme, filters, comment details, and responsive layout are available', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  await page.goto(reportUrl);
  const language = page.getByRole('button', {name: /Language: English; next: Русский/});
  await language.hover();
  await expect(page.getByRole('tooltip')).toContainText('Language: English; next: Русский');
  await language.click();
  await expect(page.getByRole('heading', {name: 'Отчёт о переносе'})).toHaveClass(/visually-hidden/);
  const systemTheme = page.getByRole('button', {name: /Тема: Системная; далее: Светлая/});
  await systemTheme.click();
  await page.getByRole('button', {name: /Тема: Светлая; далее: Тёмная/}).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(page.getByRole('heading', {name: 'Отчёт о переносе'})).toHaveClass(/visually-hidden/);
  await page.getByRole('combobox', {name: 'Фильтр'}).click();
  await page.getByRole('option', {name: 'Частично'}).click();
  await expect(page.getByRole('treeitem').filter({hasText: 'Partial child'})).toBeVisible();
  await expect(page.getByRole('treeitem').filter({hasText: 'Blocked child'})).toHaveCount(0);
  await page.getByRole('combobox', {name: 'Фильтр'}).click();
  await page.getByRole('option', {name: 'Все'}).click();
  const emptyCounters = page.getByRole('treeitem').filter({hasText: 'Occupied parent'});
  await expect(emptyCounters).not.toContainText('0 файлов');
  await expect(emptyCounters).not.toContainText('0 комментариев');
  await page.getByRole('treeitem').filter({hasText: 'Knowledge base'}).click();
  await page.getByRole('tab', {name: 'Комментарии'}).click();
  await expect(page.getByRole('dialog').getByText('comment-entry-1')).toBeVisible();
  await expect(page.getByRole('dialog').getByText('Example User')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

for (const snapshot of [
  {name: 'desktop-light', width: 1440, height: 900, canvasHeight: 2400, theme: 'Light'},
  {name: 'desktop-dark', width: 1440, height: 900, canvasHeight: 2400, theme: 'Dark'},
  {name: 'mobile-light', width: 390, height: 844, canvasHeight: 2960, theme: 'Light'},
  {name: 'mobile-dark', width: 390, height: 844, canvasHeight: 2960, theme: 'Dark'},
]) {
  test(`visual snapshot ${snapshot.name}`, async ({page}) => {
    await page.setViewportSize({width: snapshot.width, height: snapshot.height});
    await page.goto(reportUrl);
    await page.addStyleTag({
      content: `html, body, #root, .report-background { min-height: ${snapshot.canvasHeight}px !important; }`,
    });
    await page.getByRole('button', {name: /Theme: System; next: Light/}).click();
    if (snapshot.theme === 'Dark') await page.getByRole('button', {name: /Theme: Light; next: Dark/}).click();
    await expect(page).toHaveScreenshot(`${snapshot.name}.png`, {animations: 'disabled', fullPage: true, maxDiffPixelRatio: 0.04});
  });
}

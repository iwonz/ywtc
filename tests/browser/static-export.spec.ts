import {access, mkdtemp, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {expect, test} from '@playwright/test';
import type {PageGraph, SourceAdapter, SourcePage, SourceResource} from '../../src/domain.js';
import {FilesystemExporter} from '../../src/filesystem-export.js';

const root: SourcePage & {depth: number} = {
  provider: 'yandex-wiki', profile: 'wiki', id: '1', canonicalId: 'wiki:1', title: 'Root', locator: 'root',
  url: 'https://wiki.example.com/root', rawContent: '# Root\n\n[Child](/child)\n\n![Pixel](pixel.png)', rawFormat: 'yfm',
  references: [{raw: '/child', href: '/child', kind: 'page'}, {raw: 'pixel.png', href: 'pixel.png', kind: 'attachment'}], depth: 0,
};
const child: SourcePage & {depth: number; projectedParentId: string} = {
  ...root, id: '2', canonicalId: 'wiki:2', title: 'Child', locator: 'child', url: 'https://wiki.example.com/child',
  rawContent: 'Child body', references: [], depth: 1, projectedParentId: root.canonicalId,
};
const graph: PageGraph = {
  rootId: root.canonicalId,
  pages: [root, child],
  edges: [{from: root.canonicalId, to: child.canonicalId, raw: '/child', status: 'resolved'}],
  warnings: [],
};

let output: string;

test.beforeAll(async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'ywtc-playwright-'));
  output = path.join(temporary, 'site');
  const resources = new Map<string, SourceResource[]>([[root.canonicalId, [{
    provider: 'yandex-wiki', id: 'pixel', pageId: root.id, name: 'pixel.png', size: 68, mimeType: 'image/png', kind: 'image',
  }]], [child.canonicalId, []]]);
  const source = {
    downloadResource: async (_resource: SourceResource, destination: string) => {
      const content = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
      await writeFile(destination, content);
      return {path: destination, size: content.length, sha256: 'fixture', mimeType: 'image/png'};
    },
  } as unknown as SourceAdapter;
  await new FilesystemExporter(source, 2).export({
    graph, directory: output, format: 'html', identity: 'browser-test', archive: false, dryRun: false,
    cacheDirectory: path.join(temporary, 'cache'), resourcesByPage: resources,
  });
});

for (const viewport of [{name: 'desktop', width: 1440, height: 900}, {name: 'mobile', width: 390, height: 844}]) {
  test(`${viewport.name}: navigation and every local resource resolve`, async ({page}) => {
    await page.setViewportSize({width: viewport.width, height: viewport.height});
    await page.goto(pathToFileURL(path.join(output, 'index.html')).toString());
    await expect(page.getByRole('heading', {name: 'Root', level: 1, exact: true})).toBeVisible();
    await expect(page.locator('.nav a[aria-current="page"]')).toHaveText('Root');
    const references = await page.locator('[href], [src]').evaluateAll((elements) => elements.map((element) => (
      element.getAttribute('href') ?? element.getAttribute('src') ?? ''
    )));
    for (const reference of references) {
      if (!reference || /^(?:https?:|mailto:|tel:|data:|#)/i.test(reference)) continue;
      await access(fileURLToPath(new URL(reference, page.url()).toString()));
    }
    expect(await page.locator('img').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    await page.getByRole('link', {name: 'Child'}).first().click();
    await expect(page.getByRole('heading', {name: 'Child', level: 1, exact: true})).toBeVisible();
    if (viewport.name === 'mobile') {
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
  });
}

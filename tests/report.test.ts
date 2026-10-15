import {mkdtemp, readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {TransferReport} from '../src/report.js';

describe('transfer report', () => {
  it('writes complete unversioned HTML and downloadable JSON metadata', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'ywtc-report-'));
    const report = new TransferReport({
      dryRun: true,
      scope: 'page',
      direction: 'yandex-wiki → filesystem',
      source: {provider: 'yandex-wiki', profile: 'wiki', rootId: '1', title: 'Root', url: 'https://wiki.example.com/root'},
      destination: {provider: 'filesystem', id: '/tmp/export', format: 'html'},
      state: {id: 'state-id', path: '/tmp/state.json', mode: 'automatic', source: 'new'},
    });
    report.addPage({
      sourceCanonicalId: 'wiki:1', sourceId: '1', sourceTitle: 'Root', sourceUrl: 'https://wiki.example.com/root',
      depth: 0, status: 'planned', resources: 0, bytes: 0, links: 1, images: 0, tables: 0, codeBlocks: 0,
      degraded: false, warnings: [],
    }, {source: '<p>Source</p>', destination: '<p>Destination</p>'});
    report.finish('completed');
    const paths = await report.write(directory);
    const json = JSON.parse(await readFile(paths.json, 'utf8')) as Record<string, unknown>;
    const html = await readFile(paths.html, 'utf8');
    expect(json).not.toHaveProperty('version');
    expect(json).toMatchObject({status: 'completed', summary: {pages: 1, links: 1}});
    expect(html).toContain('download="report.json"');
    expect(html).toContain('Source');
    expect(html).toContain('Destination');
  });
});

import {mkdtemp, readFile, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {parseWorkspaceConfig} from '../src/config.js';
import {resolveWorkspace} from '../src/workspace.js';

const configuration = {connections: {wiki: {type: 'yandex-wiki', webUrl: 'https://wiki.example.com', apiUrl: 'https://api.example.com', token: 'private-source-token', organization: {id: '1'}}}};
const request = {kind: 'scan', source: 'a', sourceProfile: 'wiki', scope: 'page', sourceStatus: 'all', comments: false, kinds: ['mentions']} as const;
describe('shared programmatic operations', () => {
  it('pins effective policies and refuses changed profile identity without persisting credentials', async () => {
    const {prepareOperation, restoreOperationConfig} = await import('../src/operations.js');
    const root = await mkdtemp(path.join(os.tmpdir(), 'ywtc-operation-')), workspace = await resolveWorkspace({explicit: root});
    const filename = path.join(root, 'ywtc.config.yaml');await writeFile(filename, JSON.stringify(configuration));
    const prepared = await prepareOperation(request, workspace);
    expect(JSON.stringify(prepared)).not.toContain('private-source-token');
    const changed = structuredClone(configuration);changed.connections.wiki.token = 'refreshed-token';await writeFile(filename, JSON.stringify(changed));
    expect(restoreOperationConfig(prepared, workspace).profiles.wiki?.token).toBe('refreshed-token');
    changed.connections.wiki.webUrl = 'https://different.example.com';await writeFile(filename, JSON.stringify(changed));
    expect(() => restoreOperationConfig(prepared, workspace)).toThrow(/identity/);
  });
  it('executes source-only analysis with a supplied adapter and reports actual inventory', async () => {
    const {prepareOperation, executeOperation} = await import('../src/operations.js');
    const root = await mkdtemp(path.join(os.tmpdir(), 'ywtc-execute-')), workspace = await resolveWorkspace({explicit: root});
    const filename = path.join(root, 'ywtc.config.yaml');await writeFile(filename, JSON.stringify(configuration));
    const config = parseWorkspaceConfig(configuration, filename), prepared = await prepareOperation(request, workspace);
    const page = {id: '1', canonicalId: 'wiki:1', provider: 'yandex-wiki', profile: 'wiki', title: 'A', locator: 'a', url: 'https://wiki.example.com/a', rawFormat: 'yfm', rawContent: 'Hello @ivan', references: []};
    const adapter = {kind: 'yandex-wiki', profile: config.profiles.wiki!, preflight: async () => ({}), resolvePage: async () => page, supportsSourceStatus: () => true};
    const result = await executeOperation(prepared, workspace, {}, (() => adapter) as any);
    expect(result).toMatchObject({exitCode: 0, status: 'completed', catalogId: expect.any(String)});
    const catalog = JSON.parse(await readFile(path.join(root, '.states/decisions', result.catalogId!, 'catalog.json'), 'utf8'));
    expect(catalog.document.entries[0].identity.username).toBe('ivan');
  });
});

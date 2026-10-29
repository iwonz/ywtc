import {mkdtemp, readFile, readdir, stat, symlink, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {LocalControlCenter} from '../src/ui-service.js';
import {readWorkspaceConfig} from '../src/config.js';
import {initializeWorkspace, resolveWorkspace} from '../src/workspace.js';

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ywtc-ui-'));
  const center = new LocalControlCenter({workdir: root, port: 3456, bootstrap: 'test-bootstrap'});
  const request = (route: string, method = 'GET', body?: unknown, cookie?: string, origin = 'http://127.0.0.1:3456') => center.handle(new Request(`${origin}/api/${route}`, {method, headers: {host: '127.0.0.1:3456', origin, ...(cookie ? {cookie} : {}), 'content-type': 'application/json'}, ...(body === undefined ? {} : {body: JSON.stringify(body)})}));
  const login = await request('session', 'POST', {secret: 'test-bootstrap'});
  const cookie = login.headers.get('set-cookie')!.split(';')[0]!;
  return {root, center, request, cookie};
}
describe('local control center boundaries', () => {
  it('repairs an untouched init template from browser settings without requiring CLI init again',async()=>{
    const {root,request,cookie}=await fixture();await initializeWorkspace(await resolveWorkspace({explicit:root}));
    const spaces=await(await request('workspaces','GET',undefined,cookie)).json(),id=spaces.items[0].id,settings=await(await request(`w/${id}/settings`,'GET',undefined,cookie)).json();
    expect(settings.validation.valid).toBe(false);expect(settings.validation.fields).toContain('connections.yandex.organization.id');
    settings.connections.yandex.organization.id='1';
    const saved=await request(`w/${id}/settings`,'PUT',{...settings,repairConfirmed:true},cookie);expect(saved.status).toBe(200);expect((await saved.json()).validation.valid).toBe(true);
  });
  it('repairs invalid settings in one validated commit without exposing or losing stored secrets', async () => {
    const {root,request,cookie}=await fixture(),spaces=await(await request('workspaces','GET',undefined,cookie)).json(),id=spaces.items[0].id,file=path.join(root,'ywtc.config.yaml');
    const original=JSON.stringify({connections:{wiki:{type:'yandex-wiki',apiUrl:'https://api.example.com',webUrl:'https://wiki.example.com',token:'kept-private-token',organization:{id:''},custom:{token:'unknown-private-token'}},cloud:{type:'confluence',deployment:'cloud',baseUrl:'',authType:'api-token',token:'cloud-private-token',email:'private@example.com'}},mentions:{mode:'auto',urlTemplate:'private-template'}});
    await writeFile(file,original);
    const response=await request(`w/${id}/settings`,'GET',undefined,cookie);expect(response.status).toBe(200);const settings=await response.json();
    expect(settings.validation.valid).toBe(false);expect(settings.validation.readable).toBe(true);expect(settings.connections.wiki.hasToken).toBe(true);
    for(const secret of ['kept-private-token','unknown-private-token','cloud-private-token','private@example.com','private-template'])expect(JSON.stringify(settings)).not.toContain(secret);
    const candidate={...settings,repairConfirmed:true,mentions:{mode:'off'},connections:{...settings.connections,wiki:{...settings.connections.wiki,organization:{type:'yandex360',id:'1'}}}};
    expect((await request(`w/${id}/settings`,'PUT',candidate,cookie)).status).toBe(400);expect(await readFile(file,'utf8')).toBe(original);
    candidate.connections.cloud.baseUrl='https://confluence.example.com/wiki';
    expect((await request(`w/${id}/settings`,'PUT',{...candidate,repairConfirmed:false},cookie)).status).toBe(400);
    const saved=await request(`w/${id}/settings`,'PUT',candidate,cookie);expect(saved.status).toBe(200);const result=await saved.json();expect(result.validation.valid).toBe(true);expect(result.backupPath).toMatch(/^\.states\/backups\//);
    expect(await readFile(path.join(root,result.backupPath),'utf8')).toBe(original);expect((await stat(path.join(root,result.backupPath))).mode&0o777).toBe(0o600);
    const config=readWorkspaceConfig(file);expect(config.profiles.wiki!.token).toBe('kept-private-token');expect((config.profiles.cloud as any).email).toBe('private@example.com');expect(config.mentions?.mode).toBe('off');
    expect((await readFile(file,'utf8'))).not.toContain('unknown-private-token');expect(JSON.stringify(result)).not.toContain('kept-private-token');
  });
  it('offers masked replacement for malformed YAML and preserves its exact backup', async()=>{
    const {root,request,cookie}=await fixture(),spaces=await(await request('workspaces','GET',undefined,cookie)).json(),id=spaces.items[0].id,file=path.join(root,'ywtc.config.yaml'),original='connections: [\n token: never-return-this-secret';await writeFile(file,original);
    const response=await request(`w/${id}/settings`,'GET',undefined,cookie);expect(response.status).toBe(200);const settings=await response.json();expect(settings.validation.readable).toBe(false);expect(JSON.stringify(settings)).not.toContain('never-return-this-secret');
    const saved=await request(`w/${id}/settings`,'PUT',{...settings,repairConfirmed:true,connections:{wiki:{type:'yandex-wiki',apiUrl:'https://api.example.com',webUrl:'https://wiki.example.com',token:'new-token',organization:{id:'1'}}}},cookie);expect(saved.status).toBe(200);const result=await saved.json();expect(await readFile(path.join(root,result.backupPath),'utf8')).toBe(original);
  });
  it('rejects stale invalid-configuration repair before writing a backup',async()=>{
    const {root,request,cookie}=await fixture(),spaces=await(await request('workspaces','GET',undefined,cookie)).json(),id=spaces.items[0].id,file=path.join(root,'ywtc.config.yaml');await writeFile(file,'connections: {}');const settings=await(await request(`w/${id}/settings`,'GET',undefined,cookie)).json();const latest='# external change\nconnections: {}';await writeFile(file,latest);
    expect((await request(`w/${id}/settings`,'PUT',{...settings,repairConfirmed:true},cookie)).status).toBe(409);expect(await readFile(file,'utf8')).toBe(latest);expect(await readdir(path.join(root,'.states'))).not.toContain('backups');
  });
  it('uses a one-time bootstrap, authenticated session, exact Host and Origin', async () => {
    const {request, cookie, center} = await fixture();
    expect((await request('workspaces')).status).toBe(401);
    expect((await request('workspaces', 'GET', undefined, cookie)).status).toBe(200);
    expect((await request('session', 'POST', {secret: 'test-bootstrap'})).status).toBe(401);
    expect((await request('workspaces', 'POST', {path: '/tmp/no'}, cookie, 'https://evil.example')).status).toBe(403);
    expect((await center.handle(new Request('http://evil.example/api/workspaces', {headers: {host: 'evil.example', cookie}}))).status).toBe(403);
  });
  it('never returns stored credentials and rejects stale settings or symlinked files', async () => {
    const {root, request, cookie} = await fixture();
    const config = {connections: {wiki: {type: 'yandex-wiki', apiUrl: 'https://api.example.com', webUrl: 'https://wiki.example.com', token: 'private-token', organization: {id: '1'}}}};
    await writeFile(path.join(root, 'ywtc.config.yaml'), JSON.stringify(config));
    const workspaces = await (await request('workspaces', 'GET', undefined, cookie)).json();
    const id = workspaces.items[0].id;
    const settings = await (await request(`w/${id}/settings`, 'GET', undefined, cookie)).json();
    expect(JSON.stringify(settings)).not.toContain('private-token');
    expect(settings.connections.wiki.hasToken).toBe(true);
    await writeFile(path.join(root, 'ywtc.config.yaml'), JSON.stringify({...config, defaults: {concurrency: 2}}));
    expect((await request(`w/${id}/settings`, 'PUT', {...settings, defaults: {concurrency: 3}}, cookie)).status).toBe(409);
    const file = path.join(root, 'other.yaml');await writeFile(file, JSON.stringify(config));
    const {unlink} = await import('node:fs/promises');await unlink(path.join(root, 'ywtc.config.yaml'));await symlink(file, path.join(root, 'ywtc.config.yaml'));
    expect((await request(`w/${id}/settings`, 'GET', undefined, cookie)).status).toBe(400);
    expect(await readFile(file, 'utf8')).toContain('private-token');
  });
  it('saves profiles privately, keeps old secrets when blank, and activates only published revisions', async () => {
    const {root, request, cookie} = await fixture(), spaces = await (await request('workspaces', 'GET', undefined, cookie)).json(), id = spaces.items[0].id;
    let settings = await (await request(`w/${id}/settings`, 'GET', undefined, cookie)).json();
    const response = await request(`w/${id}/settings`, 'PUT', {...settings, connections: {wiki: {type: 'yandex-wiki', webUrl: 'https://wiki.example.com', apiUrl: 'https://api.example.com', token: 'new-private-token', organization: {id: '1'}}}}, cookie);
    expect(response.status).toBe(200);settings = await response.json();expect(JSON.stringify(settings)).not.toContain('new-private-token');
    expect((await request(`w/${id}/settings`, 'PUT', {...settings, connections: {...settings.connections, wiki: {...settings.connections.wiki, token: ''}}}, cookie)).status).toBe(200);
    expect(await readFile(path.join(root, 'ywtc.config.yaml'), 'utf8')).toContain('new-private-token');
    const {DecisionWorkspace} = await import('../src/decision-workspace.js');const store = new DecisionWorkspace(root);
    const draft = await store.save('hashtags', {source: {provider: 'yandex-wiki', instance: 'https://wiki.example.com'}, entries: []});
    expect((await request(`w/${id}/decisions/${draft.id}/activate`, 'POST', {configRevision: settings.revision}, cookie)).status).toBe(400);
    const published = await store.publish(draft.id, draft.revision);settings = await (await request(`w/${id}/settings`, 'GET', undefined, cookie)).json();
    expect((await request(`w/${id}/decisions/${published.id}/activate`, 'POST', {configRevision: settings.revision}, cookie)).status).toBe(200);
    const {stat} = await import('node:fs/promises');expect((await stat(path.join(root, 'ywtc.config.yaml'))).mode & 0o777).toBe(0o600);
    expect((await request(`w/${id}/jobs`, 'POST', {request: {kind: 'migrate', source: 'a', destination: 'b', scope: 'page', sourceStatus: 'all', comments: false, archive: false, dryRun: false}}, cookie)).status).toBe(400);
  });
  it('keeps report bodies out of paginated tree projections and preserves ancestors', async () => {
    const {projectReportRows} = await import('../src/ui-service.js');
    const pages = Array.from({length: 10_000}, (_, i) => ({sourceCanonicalId: `p${i}`, sourceTitle: `Page ${i}`, parentId: i ? 'p0' : undefined, status: i === 9999 ? 'failed' : 'complete', resourceItems: [], comments: {comments: 0}, warnings: [], error: i === 9999 ? 'timeout' : undefined}));
    const report = {pages, excludedPages: [], issues: []} as any;
    const result = projectReportRows(report, {query: 'Page 9999', filter: 'all', offset: 0, limit: 100});
    expect(result.items.map((row: any) => row.id)).toEqual(['p0', 'p9999']);
    expect(projectReportRows(report, {query: '', filter: 'all', offset: 500, limit: 50}).items).toHaveLength(50);
    expect(JSON.stringify(result)).not.toContain('resourceItems');
  });
});

import {spawn, type ChildProcess} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtemp, readFile, stat, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {expect, test} from '@playwright/test';
import {TransferReport} from '../../src/report.js';
import {SyncPlanStore} from '../../src/sync-store.js';
import {createSyncEvidence} from '../../src/sync-contract.js';
import {sourcePage} from '../sync-fixture.js';
let child: ChildProcess, origin: string, workdir: string;
let fixture: ReturnType<typeof createServer>;
test.use({timezoneId: 'UTC', locale: 'en-US'});
const bootstrap = 'local-browser-fixture-secret';
let cookies: Awaited<ReturnType<import('@playwright/test').BrowserContext['cookies']>> = [];
const runId = '00000000-0000-4000-8000-000000000099';
let syncPlanId:string;
test.beforeAll(async () => {
  fixture = createServer((_request, response) => {response.setHeader('content-type', 'application/json');response.end(JSON.stringify({id: 1, slug: 'page', title: 'Fixture source', page_type: 'page', content: 'Hello @ivan #topic'}));});
  await new Promise<void>(resolve => fixture.listen(0, '127.0.0.1', resolve));
  const apiPort = (fixture.address() as {port: number}).port;
  const probe = createServer();await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve));const port = (probe.address() as {port: number}).port;await new Promise<void>(resolve => probe.close(() => resolve()));
  origin = `http://127.0.0.1:${port}`;workdir = await mkdtemp(path.join(os.tmpdir(), 'ywtc-ui-browser-'));
  await writeFile(path.join(workdir, 'ywtc.config.yaml'), JSON.stringify({connections: {wiki: {type: 'yandex-wiki', apiUrl: `http://127.0.0.1:${apiPort}`, webUrl: 'https://wiki.example.com', token: 'browser-fixture-token', organization: {id: '1'}}}}));
  const report = new TransferReport({runId, dryRun: false, scope: 'subtree', direction: 'yandex-wiki → confluence', source: {provider: 'yandex-wiki', profile: 'wiki', rootId: 'root', title: 'Fixture migration', url: 'https://wiki.example.com/root'}, destination: {provider: 'confluence', id: 'destination', url: 'https://confluence.example.com/page'}, state: {id: '0123456789abcdef01234567', path: '/workspace/.states/state.json', mode: 'automatic', source: 'new'}});
  const base = {sourceId: 'root', sourceUrl: 'https://wiki.example.com/root', depth: 0, inventoryStatus: 'complete', resources: 0, resourceItems: [], transferredBytes: 0, bytesUnknown: 0, links: 0, images: 0, tables: 0, grids: 0, codeBlocks: 0, degraded: false, resourceFallbacks: [], warnings: [], comments: {status: 'complete', threads: 0, comments: 0, participants: 0, attachments: 0, bytes: 0}} as const;
  report.addPage({...base, sourceCanonicalId: 'root', sourceTitle: 'Root page', status: 'complete', resourceItems: [], resourceFallbacks: [], warnings: []});
  report.addPage({...base, sourceId: 'child', sourceCanonicalId: 'child', sourceTitle: 'Child failed', parentId: 'root', depth: 1, status: 'failed', resourceItems: [], resourceFallbacks: [], warnings: [], error: 'Fixture timeout'}, {source: '<p>Source text</p><script>parent.window.xss = true</script>', destination: '<p>Destination text</p>'});
  report.finish('partial');report.data.startedAt = '2026-01-01T12:00:00.000Z';report.data.finishedAt = '2026-01-01T12:01:00.000Z';await report.write(path.join(workdir, '.states/reports'));
  const page=sourcePage('1','Reviewed page','New body'),evidence=createSyncEvidence(page,[],undefined,{mentions:{mode:'off'},hashtags:{mode:'off'}}),plan=await new SyncPlanStore(workdir).create({baselineRunId:runId,stateId:'0123456789abcdef01234567',sourceRootId:'1',sourceUrl:page.url,status:'review',items:[{id:'root',sourceId:'1',title:'Reviewed page',sourceUrl:page.url,classification:'changed',reasons:['body'],evidence,resources:0,comments:0,trash:{allowed:true}}],inventory:{complete:true,selected:1,failures:[]},references:{pages:1,comments:0,patches:0,unresolved:0}},{previews:{root:{current:'Current <script>window.xss=true</script>',proposed:'New body'}},links:[],baseline:{baseline:{pages:[]}}});syncPlanId=plan.id;
  child = spawn(process.execPath, [path.resolve('dist/web/server.js')], {stdio: 'pipe', env: {...process.env, PORT: String(port), HOSTNAME: '127.0.0.1', NEXT_TELEMETRY_DISABLED: '1', YWTC_UI_WORKDIR: workdir, YWTC_UI_BOOTSTRAP: bootstrap, YWTC_UI_RUNTIME: path.resolve('dist')}});
  let errors = '';child.stderr?.on('data', data => {errors += data;});child.stdout?.resume();
  for (let i = 0; i < 100; i++) {try {if ((await fetch(`${origin}/api/health`)).ok) return;} catch {}if (child.exitCode !== null) throw Error(errors);await new Promise(resolve => setTimeout(resolve, 100));}
  throw Error(`UI startup timed out ${errors}`);
});
test.afterAll(async () => {child?.kill('SIGTERM');fixture?.closeAllConnections();await new Promise<void>(resolve => fixture?.close(() => resolve()));});
test.beforeEach(async ({page, context}) => {
  if (!cookies.length) {
    await page.goto(`${origin}/#${bootstrap}`);
    await expect(page.getByRole('button', {name: 'New migration', exact: true})).toBeVisible();
    await expect(page).not.toHaveURL(/#/);
    cookies = await context.cookies();
  }
  await context.addCookies(cookies);
});

test('recognizable navigation keeps labels, active semantics and keyboard access on desktop and mobile',async({page})=>{
  await page.setViewportSize({width:1280,height:900});await page.goto(origin);await expect(page.locator('.brand')).toHaveText('ywtc');
  const nav=page.getByRole('navigation',{name:'Work areas'});await expect(nav.getByRole('button')).toHaveCount(5);
  for(const label of ['Migrations & reports','Tasks','Decisions','Synchronization','Connections']){
    const button=nav.getByRole('button',{name:label,exact:true});await expect(button.locator('svg')).toHaveAttribute('aria-hidden','true');await button.focus();await page.keyboard.press('Enter');await expect(button).toHaveAttribute('aria-current','page');await expect(nav.locator('[aria-current=page]')).toHaveCount(1);await expect(page.locator('.context-strip')).not.toBeEmpty();
  }
  expect(await page.locator('.workspace-navigation').evaluate((el)=>el.getBoundingClientRect().right)).toBeLessThan(await page.locator('.workspace-content').evaluate((el)=>el.getBoundingClientRect().left));
  await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Language',exact:true}).click();
  const mobileNav=page.getByRole('navigation',{name:'Рабочие разделы'});await expect(mobileNav.getByRole('button',{name:'Подключения',exact:true})).toHaveAttribute('aria-current','page');
  for(const button of await mobileNav.getByRole('button').all())await expect(button).toBeVisible();await expect(page.getByRole('button',{name:'Новая миграция',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
});

test('repairs invalid settings through staged drafts, preserving server credentials and original backup',async({page})=>{
  const filename=path.join(workdir,'ywtc.config.yaml'),original=await readFile(filename,'utf8'),invalid=JSON.parse(original);invalid.connections.wiki.organization.id='';invalid.mentions={mode:'auto'};const broken=JSON.stringify(invalid);
  await writeFile(filename,broken);
  try{
    await page.goto(origin);await page.getByRole('button',{name:'New migration',exact:true}).click();await expect(page.getByText('Repair configuration in Connections before starting.')).toBeVisible();await expect(page.getByRole('button',{name:'Start dry-run',exact:true})).toBeDisabled();await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'Connections',exact:true}).click();await expect(page.getByText('Repair configuration',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Probe access',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Apply repair',exact:true})).toBeDisabled();
    await page.getByRole('button',{name:'Edit',exact:true}).click();await page.getByLabel('Organization ID',{exact:true}).fill('1');await expect(page.getByLabel('Token · empty keeps current',{exact:true})).toHaveValue('');await page.getByRole('button',{name:'Stage profile',exact:true}).click();expect(await readFile(filename,'utf8')).toBe(broken);
    await page.getByRole('combobox',{name:'Mentions',exact:true}).click();await page.getByRole('option',{name:'off',exact:true}).click();await page.getByRole('checkbox',{name:'Confirm repair with a private backup',exact:true}).check();await page.getByRole('button',{name:'Apply repair',exact:true}).click();await expect(page.getByText(/Configuration repaired. Backup/)).toBeVisible();await expect(page.getByRole('button',{name:'Probe access',exact:true})).toBeEnabled();
    const spaces=await page.evaluate(async()=>fetch('/api/workspaces').then(r=>r.json())),settings=await page.evaluate(async(id)=>fetch(`/api/w/${id}/settings`).then(r=>r.json()),spaces.items[0].id);expect(settings.validation.valid).toBe(true);expect(JSON.stringify(settings)).not.toContain('browser-fixture-token');expect(await readFile(filename,'utf8')).toContain('browser-fixture-token');
    const notice=await page.getByText(/Configuration repaired. Backup/).textContent(),backup=notice!.split('Backup: ')[1]!;expect(await readFile(path.join(workdir,backup),'utf8')).toBe(broken);expect((await stat(path.join(workdir,backup))).mode&0o777).toBe(0o600);
    await page.reload();await page.getByRole('button',{name:'Connections',exact:true}).click();await expect(page.getByText('Repair configuration',{exact:true})).not.toBeVisible();
  }finally{await writeFile(filename,original);}
});

test('connection forms, workspace focus and persistent theme use shared components', async ({page,context})=>{
  if(cookies.length)await context.addCookies(cookies);
  await page.emulateMedia({colorScheme:'light'});
  await page.goto(cookies.length?origin:`${origin}/#${bootstrap}`);
  await expect(page.getByRole('button',{name:'New migration',exact:true})).toBeVisible();
  cookies=await context.cookies();
  const connect=page.getByRole('button',{name:'Connect workspace',exact:true});
  await connect.click();await expect(page.getByLabel('Absolute path', {exact:true})).toBeFocused();
  await page.keyboard.press('Escape');await expect(page.locator('[data-slot=dialog-content]')).toHaveCount(0);await expect(connect).toBeFocused();
  await page.getByRole('button',{name:'Connections',exact:true}).click();
  await page.getByRole('button',{name:'Edit',exact:true}).click();
  await expect(page.getByLabel('Profile name',{exact:true})).toBeDisabled();
  await page.getByLabel('Auth',{exact:true}).click();await page.getByRole('option',{name:'iam',exact:true}).click();
  const token=page.getByLabel('Token · empty keeps current',{exact:true});await expect(token).toHaveValue('');await expect(token).toHaveAttribute('type','password');
  await page.getByRole('button',{name:'Show password',exact:true}).click();await expect(token).toHaveAttribute('type','text');
  await page.keyboard.press('Escape');await expect(page.locator('[data-slot=dialog-content]')).toHaveCount(0);
  const theme=page.getByRole('button',{name:'Theme',exact:true});await theme.click();await expect(page.locator('html')).toHaveClass(/light/);await theme.click();await expect(page.locator('html')).toHaveClass(/dark/);
  await page.reload();await expect(page.locator('html')).toHaveClass(/dark/);await expect(page.locator('[data-slot=button]').first()).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
});
test('localhost analysis, editor revisions, cross-tab conflict, mobile and no external UI requests', async ({page, context}) => {
  const errors: string[] = [], external: string[] = [];
  page.on('pageerror', error => errors.push(error.message));page.on('request', request => {if (!request.url().startsWith(origin) && /^https?:/.test(request.url())) external.push(request.url());});
  if(cookies.length)await context.addCookies(cookies);
  await page.goto(cookies.length?origin:`${origin}/#${bootstrap}`);
  await expect(page.getByRole('button', {name: 'New migration', exact: true})).toBeVisible();
  cookies = await context.cookies();
  await expect(page).not.toHaveURL(/#/);
  await page.getByRole('button', {name: 'New migration', exact: true}).click();
  await expect(page.getByRole('button', {name: 'Start dry-run', exact: true})).toBeDisabled();
  await expect(page.getByLabel('Include comments')).toBeChecked();
  await page.getByLabel('Destination', {exact: true}).click();await page.getByRole('option', {name: 'HTML', exact: true}).click();await expect(page.getByLabel('Create ZIP')).toBeVisible();await page.getByLabel('Create ZIP').check();
  await page.getByLabel('Destination', {exact: true}).click();await page.getByRole('option', {name: 'Markdown', exact: true}).click();await expect(page.getByLabel('Create ZIP')).not.toBeChecked();
  await page.getByLabel('Destination', {exact: true}).click();await page.getByRole('option', {name: 'Yandex Wiki', exact: true}).click();await expect(page.getByLabel('Create ZIP')).not.toBeVisible();await page.keyboard.press('Escape');
  await expect(page.locator('[data-slot=dialog-content]')).toHaveCount(0);
  expect(errors).toEqual([]);
  await page.getByRole('button', {name: 'Decisions', exact: true}).click();
  await page.getByRole('button', {name: 'Analyze source'}).click();
  await page.getByLabel('Source URL / ID / slug / space URL').fill('page');
  await page.getByLabel('Scope', {exact: true}).click();await page.getByRole('option', {name: 'page', exact: true}).click();
  await page.getByLabel('Comments', {exact: true}).uncheck();
  await page.getByRole('button', {name: 'Start analysis'}).click();
  await expect(page.getByText('completed · exit 0')).toBeVisible({timeout: 20000});
  await page.getByRole('button', {name: 'Decisions', exact: true}).click();
  await expect(page.getByText('mentions', {exact: true}).first()).toBeVisible();
  const catalogRow = page.locator('.row').filter({has: page.getByText('mentions', {exact: true})});
  await catalogRow.getByRole('button').click();
  await expect(page.getByRole('list', {name: 'Decisions'})).toBeVisible();
  await page.getByLabel('Decision @ivan', {exact: true}).click();await page.getByRole('option', {name: 'url', exact: true}).click();
  await page.getByLabel('URL @ivan', {exact: true}).fill('https://people.example.com/ivan');
  await page.getByLabel('Text @ivan', {exact: true}).fill('@ivan');
  const tab = await context.newPage();await tab.goto(origin);await tab.getByRole('button', {name: 'Decisions', exact: true}).click();
  await tab.locator('.row').filter({has: tab.getByText('mentions', {exact: true})}).getByRole('button').click();
  await page.getByRole('button', {name: 'Save draft', exact: true}).click();
  await tab.getByLabel('Decision @ivan', {exact: true}).click();await tab.getByRole('option', {name: 'url', exact: true}).click();await tab.getByLabel('URL @ivan', {exact: true}).fill('https://people.example.com/other');
  await tab.getByRole('button', {name: 'Save draft', exact: true}).click();await expect(tab.getByText(/revision changed/)).toBeVisible();await tab.close();
  await page.getByRole('button', {name: 'Publish revision', exact: true}).click();await expect(page.getByRole('button', {name: 'Activate in workspace'})).toBeVisible();
  page.once('dialog', dialog => dialog.accept());await page.getByRole('button', {name: 'Activate in workspace'}).click();
  const downloading = page.waitForEvent('download');await page.getByRole('button', {name: 'Download JSON'}).click();expect((await downloading).suggestedFilename()).toBe('decisions.json');
  await page.getByRole('button', {name: 'Delete @ivan', exact: true}).click();await expect(page.getByRole('button', {name: 'Undo delete'})).toBeVisible();await page.getByRole('button', {name: 'Undo delete'}).click();
  await page.setViewportSize({width: 390, height: 844});await expect(page.getByLabel('Theme', {exact: true})).toBeVisible();await page.getByLabel('Theme', {exact: true}).click();await page.getByLabel('Language', {exact: true}).click();await expect(page.getByRole('button', {name: 'Новая миграция', exact: true})).toBeVisible();
  expect(await page.evaluate(() => Array.from(document.querySelectorAll('body *')).filter(el => el.getBoundingClientRect().right > innerWidth + 2).map(el => ({tag: el.tagName, cls: el.className, width: el.getBoundingClientRect().width, right: el.getBoundingClientRect().right})).slice(0, 12))).toEqual([]);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
  expect(external).toEqual([]);expect(errors).toEqual([]);
});
test('report hierarchy, keyboard modal, sandbox, and paginated read-only evidence', async ({page, context}) => {
  if (!cookies.length) {const response = await fetch(`${origin}/api/session`, {method: 'POST', headers: {origin, 'content-type': 'application/json'}, body: JSON.stringify({secret: bootstrap})});const value = response.headers.get('set-cookie')!.split(';')[0]!.split('=')[1]!;await context.addCookies([{name: 'ywtc-session', value, url: origin}]);} else await context.addCookies(cookies);await page.goto(origin);
  await page.getByRole('button', {name: 'Fixture migration', exact: true}).click();
  await expect(page.getByRole('treeitem').filter({hasText: 'Child failed'})).toHaveAttribute('aria-level', '2');
  await page.getByLabel('Search tree').fill('Child failed');await expect(page.getByRole('treeitem')).toHaveCount(2);
  const child = page.getByRole('treeitem').filter({hasText: 'Child failed'});await child.focus();await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('tab', {name: 'Compare', exact: true}).click();
  await expect(page.frameLocator('iframe[title="Source preview"]').getByText('Source text')).toBeVisible();expect(await page.evaluate(() => (window as any).xss)).toBeUndefined();
  await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('link', {name: 'https://wiki.example.com/root', exact: true}).getAttribute('href').then(href => expect(href).toBe('https://wiki.example.com/root'));
  await page.getByLabel('Search tree').fill('');
  for (const theme of ['light', 'dark']) for (const [name, viewport] of [['desktop', {width: 1280, height: 900}], ['mobile', {width: 390, height: 844}]] as const) {
    await page.evaluate(value => {localStorage.setItem('ywtc-ui-theme', value);document.documentElement.classList.toggle('dark', value === 'dark');document.documentElement.classList.toggle('light', value === 'light');}, theme);await page.setViewportSize(viewport);
    await page.mouse.move(0,0);await page.evaluate(()=>{(document.activeElement as HTMLElement)?.blur();window.scrollTo(0,0);});
    await expect(page).toHaveScreenshot(`local-center-${theme}-${name}.png`, {fullPage: true, maxDiffPixelRatio: 0.01, mask: [page.getByRole('combobox', {name: 'Workspace'})]});
  }
});

test('synchronization review uses revision-checked decisions, keyboard modal and explicit confirmation',async({page,context})=>{await context.addCookies(cookies);await page.goto(origin);await page.getByRole('button',{name:'Synchronization',exact:true}).click();await page.getByRole('combobox',{name:'Synchronization plan',exact:true}).click();await page.getByRole('option').filter({hasText:'review'}).click();await expect(page.getByRole('button',{name:'Apply plan',exact:true})).toBeDisabled();await page.getByRole('button',{name:'Reviewed page',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('Current <script>window.xss=true</script>');expect(await page.evaluate(()=>(window as any).xss)).toBeUndefined();await page.keyboard.press('Escape');
 const tab=await context.newPage();await tab.goto(origin);await tab.getByRole('button',{name:'Synchronization',exact:true}).click();await tab.getByRole('combobox',{name:'Synchronization plan',exact:true}).click();await tab.getByRole('option').filter({hasText:'review'}).click();
 await page.getByRole('combobox',{name:'Decision: Reviewed page',exact:true}).click();await page.getByRole('option',{name:'Keep',exact:true}).click();await expect(page.getByText(/Decisions remaining/)).not.toBeVisible();
 await tab.getByRole('combobox',{name:'Decision: Reviewed page',exact:true}).click();await tab.getByRole('option',{name:'Update',exact:true}).click();await expect(tab.getByRole('alert').getByText(/revision.*changed|decisions.*changed/i)).toBeVisible();await tab.close();
 await page.getByRole('checkbox',{name:/Confirm decisions/}).check();await expect(page.getByRole('button',{name:'Apply plan',exact:true})).toBeEnabled();
 await page.getByRole('combobox',{name:'Decision: Reviewed page',exact:true}).click();await page.getByRole('option',{name:'Trash',exact:true}).click();await page.getByRole('checkbox',{name:/Confirm decisions/}).check();await expect(page.getByRole('button',{name:'Apply plan',exact:true})).toBeDisabled();await page.getByRole('checkbox',{name:/Separately confirm/}).check();await expect(page.getByRole('button',{name:'Apply plan',exact:true})).toBeEnabled();
 const spaces=await page.evaluate(async()=>fetch('/api/workspaces').then(r=>r.json())),w=spaces.items[0].id;const projection=await page.evaluate(async({w,id})=>fetch(`/api/w/${w}/sync/${id}`).then(r=>r.json()),{w,id:syncPlanId});expect(JSON.stringify(projection)).not.toContain('window.xss');await page.setViewportSize({width:390,height:844});await expect(page.getByRole('button',{name:'Apply plan',exact:true})).toBeVisible();});

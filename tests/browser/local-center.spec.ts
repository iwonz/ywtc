import {spawn, type ChildProcess} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtemp, readFile, realpath, stat, writeFile} from 'node:fs/promises';
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

test('workspace sidebar, collapse preference, help and repository link guide the workflow', async ({page}) => {
  await page.goto(origin);
  const sidebar=page.locator('.workspace-navigation'),nav=page.getByRole('navigation',{name:'Work areas'});
  await expect(nav.getByRole('button',{name:'Connections',exact:true})).toHaveAttribute('aria-current','page');
  await expect(sidebar.getByRole('combobox',{name:'Workspace',exact:true})).toBeVisible();
  await expect(page.locator('header').getByRole('combobox')).toHaveCount(0);
  await expect(page.getByText('Migration control center',{exact:true})).toHaveCount(0);
  const github=page.getByRole('link',{name:'Project on GitHub',exact:true});await expect(github).toHaveAttribute('href','https://github.com/iwonz/ywtc');await expect(github).toHaveAttribute('target','_blank');await expect(github).toHaveAttribute('rel',/noopener/);
  expect(await page.locator('.top').evaluate(el=>getComputedStyle(el).borderBottomWidth)).toBe('0px');expect(await sidebar.evaluate(el=>getComputedStyle(el).borderRightWidth)).toBe('0px');
  await page.getByRole('button',{name:'Collapse sidebar',exact:true}).click();await expect(page.getByRole('button',{name:'Expand sidebar',exact:true})).toHaveAttribute('aria-expanded','false');await expect(sidebar.getByRole('combobox')).toHaveCount(0);
  await page.reload();await expect(page.getByRole('button',{name:'Expand sidebar',exact:true})).toBeVisible();await page.getByRole('button',{name:'Choose workspace',exact:true}).click();await expect(sidebar.getByRole('combobox',{name:'Workspace',exact:true})).toBeFocused();
  await page.getByRole('button',{name:'Help',exact:true}).click();const help=page.getByRole('dialog',{name:'Using ywtc',exact:true});await expect(help).toContainText('This is not a Confluence space');await help.getByRole('tab',{name:'Statuses',exact:true}).click();await expect(help).toContainText('finished means execution ended');await expect(help.getByRole('link',{name:'Full status conditions in README'})).toHaveAttribute('target','_blank');await page.keyboard.press('Escape');
  await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Collapse sidebar',exact:true}).click();for(const button of await nav.getByRole('button').all())await expect(button).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
});

test('branded header and localized action labels fit narrow containers',async({page})=>{
  await page.goto(origin);
  const github=page.getByRole('link',{name:'Project on GitHub',exact:true});
  await expect(github.locator('svg[data-brand="github"]')).toBeVisible();
  expect(await github.evaluate(el=>el===document.querySelector('.header-controls')?.lastElementChild)).toBe(true);
  await expect(page.getByText('Local folder with configuration and results.',{exact:true})).toHaveCount(0);
  for(const locale of ['en','ru']) {
    if(locale==='ru')await page.getByLabel('Language',{exact:true}).click();
    for(const width of [360,768,1280]) {
      await page.setViewportSize({width,height:900});
      const action=page.getByRole('button',{name:locale==='ru'?'Подключить пространство':'Connect workspace',exact:true});
      await expect(action).toBeVisible();
      expect(await action.evaluate(el=>{
        const icon=el.querySelector('.ui-button-icon')!,label=el.querySelector('.ui-button-label')!,box=el.getBoundingClientRect(),i=icon.getBoundingClientRect(),l=label.getBoundingClientRect(),parent=el.closest('.workspace-navigation')!.getBoundingClientRect();
        return {fits:box.left>=parent.left-1&&box.right<=parent.right+1&&l.right<=box.right+1&&l.bottom<=box.bottom+1,leading:i.right<=l.left+1,readable:label.scrollWidth<=label.clientWidth+1};
      })).toEqual({fits:true,leading:true,readable:true});
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
    }
  }
});

test('illustrated empty areas guide the next action without empty pagination or writes',async({page,context})=>{
  const external:string[]=[],writes:string[]=[],errors:string[]=[];
  page.on('request',r=>{if(!r.url().startsWith(origin)&&!r.url().startsWith('data:'))external.push(r.url());if(r.method()!=='GET')writes.push(r.url());});page.on('pageerror',e=>errors.push(e.message));
  await page.route(/\/api\/w\/[^/]+\/(settings|reports|jobs|sync|decisions)(?:\?|$)/,async route=>{
    const response=await route.fetch(),data=await response.json();
    if(/\/settings$/.test(route.request().url()))data.connections={};else {data.items=[];data.total=0;data.invalid=[];}
    await route.fulfill({response,json:data});
  });
  await page.goto(origin);
  const areas=[['Connections','connections'],['Migrations & reports','reports'],['Tasks','tasks'],['Synchronization','sync'],['Mentions & hashtags','decisions']] as const;
  for(const [label,kind]of areas){
    await page.getByRole('navigation',{name:'Work areas'}).getByRole('button',{name:label,exact:true}).click();
    const state=page.locator(`[data-empty-state="${kind}"]`);await expect(state).toBeVisible();
    const image=state.locator('img');await expect(image).toHaveAttribute('src',`/illustrations/${kind}.png`);await expect.poll(()=>image.evaluate((el:HTMLImageElement)=>el.complete&&el.naturalWidth>0)).toBe(true);await expect(image).toHaveAttribute('alt','');
    await expect(page.getByRole('button',{name:'Previous page',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Next page',exact:true})).toHaveCount(0);
    expect(await page.locator('button.ui-button:visible').evaluateAll(buttons=>buttons.filter(el=>el.textContent?.trim()&&el.getAttribute('role')!=='combobox'&&!el.querySelector('svg')).map(el=>el.textContent))).toEqual([]);
    if(kind==='connections'){await state.getByRole('button',{name:'Add connection',exact:true}).click();await expect(page.getByRole('dialog',{name:'Connection profile',exact:true})).toBeVisible();await page.keyboard.press('Escape');}
    if(kind==='tasks'||kind==='reports'){await state.getByRole('button',{name:'Prepare migration',exact:true}).click();await expect(page.getByRole('dialog',{name:'New migration',exact:true})).toBeVisible();await page.keyboard.press('Escape');}
    if(kind==='sync'){await state.getByRole('button',{name:'New analysis',exact:true}).click();await expect(page.getByLabel('Original migration Run ID',{exact:true})).toBeFocused();await expect(page.getByRole('button',{name:'Analyze without writes',exact:true})).toBeDisabled();}
    if(kind==='decisions'){await state.getByRole('button',{name:'Analyze source',exact:true}).click();await expect(page.getByRole('dialog',{name:'Source-only analysis',exact:true})).toBeVisible();await page.keyboard.press('Escape');}
  }
  await page.getByRole('navigation',{name:'Work areas'}).getByRole('button',{name:'Tasks',exact:true}).click();await expect(page.locator('[data-empty-state="tasks"]')).toBeVisible();
  for(const theme of ['light','dark'])for(const [name,viewport]of [['desktop',{width:1280,height:900}],['mobile',{width:390,height:844}]]as const){
    await page.evaluate(value=>{localStorage.setItem('ywtc-ui-theme',value);document.documentElement.classList.toggle('dark',value==='dark');document.documentElement.classList.toggle('light',value==='light');},theme);await page.setViewportSize(viewport);await page.mouse.move(0,0);await page.evaluate(()=>{(document.activeElement as HTMLElement)?.blur();window.scrollTo(0,0);});
    await expect(page).toHaveScreenshot(`local-center-empty-${theme}-${name}.png`,{fullPage:true,maxDiffPixelRatio:0.01,mask:[page.getByRole('combobox',{name:'Workspace',exact:true})]});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
  }
  expect(external).toEqual([]);expect(writes).toEqual([]);expect(errors).toEqual([]);expect(await context.cookies()).not.toHaveLength(0);
});

test('delayed and failed collection reads never masquerade as empty success',async({page})=>{
  let release!:()=>void;const held=new Promise<void>(resolve=>release=resolve);let failed=false;
  await page.route(/\/api\/w\/[^/]+\/jobs(?:\?|$)/,async route=>{await held;if(failed)await route.fulfill({status:503,json:{error:'Fixture history is unavailable'}});else await route.fulfill({json:{items:[],total:0}});});
  await page.goto(origin);await page.getByRole('button',{name:'Tasks',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Loading data'})).toBeVisible();await expect(page.locator('[data-empty-state]')).toHaveCount(0);
  const failure=page.getByRole('alert').filter({hasText:'Fixture history is unavailable'});failed=true;release();await expect(failure).toBeVisible();await expect(page.locator('[data-empty-state]')).toHaveCount(0);
  failed=false;await page.getByRole('button',{name:'Retry loading',exact:true}).click();await expect(page.locator('[data-empty-state="tasks"]')).toBeVisible();await expect(failure).toHaveCount(0);
});

test('long page and profile labels yield width to sibling actions in both locales',async({page})=>{
  const title='Оченьдлинноеназваниедокумента'.repeat(24),profile='profile'.repeat(80),writes:string[]=[];
  page.on('request',r=>{if(r.method()!=='GET')writes.push(r.url());});
  await page.route(/\/api\/w\/[^/]+\/(settings|reports)(?:\/|\?|$)/,async route=>{
    const response=await route.fetch(),data=await response.json(),url=new URL(route.request().url());
    if(url.pathname.endsWith('/settings'))data.connections={[profile]:Object.values(data.connections)[0]};
    else if(url.pathname.endsWith('/rows'))for(const [i,row]of data.items.entries())row.title=title+i;
    else if(url.pathname.endsWith('/reports'))for(const item of data.items)item.source.title=title;
    else if(data.source)data.source.title=title;
    await route.fulfill({response,json:data});
  });
  await page.goto(origin);
  const fits=async()=>expect(await page.evaluate(()=>{
    const bad=Array.from(document.querySelectorAll('.workspace-content .row')).flatMap(row=>Array.from(row.children).filter(el=>{const box=el.getBoundingClientRect(),parent=row.getBoundingClientRect();return box.left<parent.left-1||box.right>parent.right+1||el.scrollWidth>el.clientWidth+1;}).map(el=>({tag:el.tagName,cls:el.className,text:el.textContent?.slice(0,50),width:el.clientWidth,scroll:el.scrollWidth})));
    return {overflow:document.documentElement.scrollWidth>innerWidth+2,bad};
  })).toEqual({overflow:false,bad:[]});
  for(const locale of ['en','ru']){
    if(locale==='ru')await page.getByLabel('Language',{exact:true}).click();
    await page.getByRole('navigation',{name:locale==='ru'?'Рабочие разделы':'Work areas'}).getByRole('button',{name:locale==='ru'?'Подключения':'Connections',exact:true}).click();await expect(page.getByText(profile,{exact:true})).toBeVisible();
    for(const width of [1280,900,720,390]){await page.setViewportSize({width,height:900});await fits();}
    await page.getByRole('button',{name:locale==='ru'?'Миграции и отчёты':'Migrations & reports',exact:true}).click();await page.getByRole('button',{name:title,exact:true}).click();await expect(page.getByRole('treeitem')).toHaveCount(2);
    for(const width of [1280,900,720,390]){await page.setViewportSize({width,height:900});await fits();}
  }
  expect(writes).toEqual([]);
});

test('migration form explains scope, required fields and options and invalidates live confirmation',async({page})=>{
  await page.goto(origin);await page.getByRole('button',{name:'New migration',exact:true}).click();const form=page.getByRole('dialog',{name:'New migration',exact:true});
  await expect(form.getByLabel('Source · URL / ID / slug / space URL',{exact:true})).toHaveAttribute('required','');await expect(form.getByRole('combobox',{name:'Source profile',exact:true})).toHaveAttribute('aria-required','true');
  await expect(form.getByRole('radio',{name:'subtree',exact:true})).toBeChecked();await expect(form.getByRole('radio',{name:'subtree',exact:true})).toHaveAccessibleDescription(/all accessible space pages/);await expect(form.getByRole('radio',{name:'page',exact:true})).toHaveAccessibleDescription(/homepage/);await expect(form.getByRole('radio',{name:'linked',exact:true})).toHaveAccessibleDescription(/Comment links do not expand/);
  await page.screenshot({path:path.join(os.tmpdir(),'ywtc-guided-migration.png'),animations:'disabled'});
  const info=form.getByRole('button',{name:'Info: Source profile',exact:true});await info.hover();await expect(page.getByRole('dialog',{name:'Source profile',exact:true})).toBeVisible();await page.mouse.move(0,0);await expect(page.getByRole('dialog',{name:'Source profile',exact:true})).toHaveCount(0);await info.focus();await info.click();await expect(page.getByRole('dialog',{name:'Source profile',exact:true})).toBeVisible();await page.keyboard.press('Escape');await expect(form).toBeVisible();
  await form.getByRole('combobox',{name:'Destination',exact:true}).click();await page.getByRole('option',{name:'HTML',exact:true}).click();await form.getByLabel('Source · URL / ID / slug / space URL',{exact:true}).fill('page');await form.getByLabel('Export directory',{exact:true}).fill('/tmp/fixture-export');await form.getByRole('radio',{name:'page',exact:true}).check();await form.getByLabel('Include comments',{exact:true}).uncheck();
  await form.getByLabel('Live · write to destination',{exact:true}).check();const confirm=form.getByLabel('I confirm this migration will write destination data',{exact:true});await confirm.check();await expect(form.getByRole('button',{name:'Start migration',exact:true})).toBeEnabled();await form.getByLabel('Source · URL / ID / slug / space URL',{exact:true}).fill('changed-page');await expect(confirm).not.toBeChecked();await expect(form.getByRole('button',{name:'Start migration',exact:true})).toBeDisabled();await form.getByLabel('Live · write to destination',{exact:true}).uncheck();
  let request:any;await page.route(/\/api\/w\/[^/]+\/jobs$/,async route=>{request=route.request().postDataJSON();await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:'Fixture preflight rejected; repair selected profile'})});});
  await form.getByRole('button',{name:'Start dry-run',exact:true}).click();await expect(form.getByRole('alert')).toContainText('Fixture preflight rejected');expect(request.request).toMatchObject({kind:'migrate',source:'changed-page',scope:'page',sourceStatus:'all',comments:false,format:'html',archive:false,dryRun:true});expect(request.confirmed).toBe(false);
});

test('connecting another workspace selects its connections and clears report context',async({page})=>{
  const other=await mkdtemp(path.join(os.tmpdir(),'ywtc-ui-other-'));await page.goto(origin);await page.getByRole('button',{name:'Migrations & reports',exact:true}).click();await page.getByRole('button',{name:'Fixture migration',exact:true}).click();await expect(page.getByRole('treeitem')).toHaveCount(2);
  await page.getByRole('button',{name:'Connect workspace',exact:true}).click();await page.getByLabel('Absolute path',{exact:true}).fill(other);await page.getByRole('button',{name:'Create',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByRole('button',{name:'Connections',exact:true})).toHaveAttribute('aria-current','page');await expect(page.getByRole('combobox',{name:'Workspace',exact:true})).toContainText(await realpath(other));
  await page.getByRole('button',{name:'Migrations & reports',exact:true}).click();await expect(page.locator('[data-empty-state="reports"]')).toBeVisible();await expect(page.getByRole('treeitem')).toHaveCount(0);
  await page.getByRole('combobox',{name:'Workspace',exact:true}).click();await page.getByRole('option',{name:await realpath(workdir),exact:true}).click();await expect(page.getByRole('button',{name:'Connections',exact:true})).toHaveAttribute('aria-current','page');
});

test('task progress separates lifecycle and result and never invents unknown-total completion',async({page})=>{
  const id='00000000-0000-4000-8000-000000000112';const job={id,status:'finished',createdAt:'2026-01-01T12:00:00Z',request:{kind:'migrate',dryRun:true},runId,result:{runId,status:'partial',exitCode:1},progress:{type:'progress',phase:'Source inventory',completed:2,unit:'pages',elapsedMs:2000,lastCompletedAt:Date.now(),active:[]}};
  await page.route(/\/api\/w\/[^/]+\/jobs(?:\?.*)?$/,route=>route.fulfill({contentType:'application/json',body:JSON.stringify({items:[job],total:1})}));
  await page.route(/\/api\/w\/[^/]+\/jobs\/00000000-0000-4000-8000-000000000112\/events$/,route=>route.fulfill({contentType:'text/event-stream',body:`event: snapshot\ndata: ${JSON.stringify(job)}\n\n`}));
  await page.goto(origin);await page.getByRole('button',{name:'Tasks',exact:true}).click();await page.getByRole('button',{name:'Migration · 00000000',exact:true}).click();await expect(page.getByText('Source inventory',{exact:true})).toBeVisible();await expect(page.getByText(/not destination writing yet/)).toBeVisible();await expect(page.getByRole('progressbar')).toHaveCount(0);await expect(page.getByText(/Job state: finished/)).toBeVisible();await expect(page.getByText(/Operation result: partial/)).toBeVisible();await expect(page.getByRole('button',{name:'Run live',exact:true})).toHaveCount(0);await expect(page.getByText(/Analysis did not produce a live-ready result/)).toBeVisible();
});

test('recognizable navigation keeps labels, active semantics and keyboard access on desktop and mobile',async({page})=>{
  await page.setViewportSize({width:1280,height:900});await page.goto(origin);await expect(page.locator('.brand')).toHaveText('ywtc');
  const nav=page.getByRole('navigation',{name:'Work areas'});await expect(nav.getByRole('button')).toHaveCount(5);
  expect(await nav.getByRole('button').allTextContents()).toEqual(['Connections','Migrations & reports','Tasks','Synchronization','Mentions & hashtags']);
  for(const label of ['Migrations & reports','Tasks','Mentions & hashtags','Synchronization','Connections']){
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
  await page.getByRole('button', {name: 'Mentions & hashtags', exact: true}).click();
  await page.getByRole('button', {name: 'Analyze source'}).click();
  await page.getByLabel('Source URL / ID / slug / space URL').fill('page');
  await page.getByRole('radio', {name: 'page', exact: true}).check();
  await page.getByLabel('Comments', {exact: true}).uncheck();
  await page.getByRole('button', {name: 'Start analysis'}).click();
  await expect(page.getByText('completed · exit 0')).toBeVisible({timeout: 20000});
  await page.getByRole('button', {name: 'Mentions & hashtags', exact: true}).click();
  await expect(page.getByText('mentions', {exact: true}).first()).toBeVisible();
  const catalogRow = page.locator('.row').filter({has: page.getByText('mentions', {exact: true})});
  await catalogRow.getByRole('button').click();
  await expect(page.getByRole('list', {name: 'Decisions'})).toBeVisible();
  await page.getByLabel('Decision @ivan', {exact: true}).click();await page.getByRole('option', {name: 'url', exact: true}).click();
  await page.getByLabel('URL @ivan', {exact: true}).fill('https://people.example.com/ivan');
  await page.getByLabel('Text @ivan', {exact: true}).fill('@ivan');
  const tab = await context.newPage();await tab.goto(origin);await tab.getByRole('button', {name: 'Mentions & hashtags', exact: true}).click();
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
  await page.getByRole('button', {name: 'Migrations & reports', exact: true}).click();
  await page.getByRole('button', {name: 'Fixture migration', exact: true}).click();
  await expect(page.getByRole('treeitem').filter({hasText: 'Child failed'})).toHaveAttribute('aria-level', '2');
  const sourceLink=page.getByRole('treeitem').filter({hasText:'Child failed'}).getByRole('link',{name:'Source',exact:true});await expect(sourceLink).toHaveAttribute('href','https://wiki.example.com/root');await context.route('https://wiki.example.com/**',route=>route.abort());const opening=page.waitForEvent('popup');await sourceLink.click();await(await opening).close();await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByLabel('Search tree').fill('no matching fixture page');await expect(page.getByRole('button',{name:'Clear filters',exact:true})).toBeVisible();await expect(page.locator('[data-empty-state]')).toHaveCount(0);await page.getByRole('button',{name:'Clear filters',exact:true}).click();await expect(page.getByRole('treeitem')).toHaveCount(2);
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
 await page.getByLabel('Search pages',{exact:true}).fill('no matching sync fixture');await expect(page.getByRole('button',{name:'Clear filters',exact:true})).toBeVisible();await expect(page.locator('[data-empty-state]')).toHaveCount(0);await page.getByRole('button',{name:'Clear filters',exact:true}).click();await expect(page.getByRole('button',{name:'Reviewed page',exact:true})).toBeVisible();
 const tab=await context.newPage();await tab.goto(origin);await tab.getByRole('button',{name:'Synchronization',exact:true}).click();await tab.getByRole('combobox',{name:'Synchronization plan',exact:true}).click();await tab.getByRole('option').filter({hasText:'review'}).click();
 await page.getByRole('combobox',{name:'Decision: Reviewed page',exact:true}).click();await page.getByRole('option',{name:'Keep',exact:true}).click();await expect(page.getByText(/Decisions remaining/)).not.toBeVisible();
 await tab.getByRole('combobox',{name:'Decision: Reviewed page',exact:true}).click();await tab.getByRole('option',{name:'Update',exact:true}).click();await expect(tab.getByRole('alert').getByText(/revision.*changed|decisions.*changed/i)).toBeVisible();await tab.close();
 await page.getByRole('checkbox',{name:/Confirm decisions/}).check();await expect(page.getByRole('button',{name:'Apply plan',exact:true})).toBeEnabled();
 await page.getByRole('combobox',{name:'Decision: Reviewed page',exact:true}).click();await page.getByRole('option',{name:'Trash',exact:true}).click();await page.getByRole('checkbox',{name:/Confirm decisions/}).check();await expect(page.getByRole('button',{name:'Apply plan',exact:true})).toBeDisabled();await page.getByRole('checkbox',{name:/Separately confirm/}).check();await expect(page.getByRole('button',{name:'Apply plan',exact:true})).toBeEnabled();
 const spaces=await page.evaluate(async()=>fetch('/api/workspaces').then(r=>r.json())),w=spaces.items[0].id;const projection=await page.evaluate(async({w,id})=>fetch(`/api/w/${w}/sync/${id}`).then(r=>r.json()),{w,id:syncPlanId});expect(JSON.stringify(projection)).not.toContain('window.xss');await page.setViewportSize({width:390,height:844});await expect(page.getByRole('button',{name:'Apply plan',exact:true})).toBeVisible();});
